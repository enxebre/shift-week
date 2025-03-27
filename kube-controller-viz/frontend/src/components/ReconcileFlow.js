import * as THREE from 'three';
import { createTextLabel } from '../utils/three-utils';

class ReconcileFlow {
  constructor(scene) {
    this.scene = scene;
    this.steps = [];
    this.stepObjects = new Map();
    this.flowGroup = new THREE.Group();
    this.flowGroup.position.set(12, 0, 0);
    this.scene.add(this.flowGroup);
    
    // Initialize all collections used throughout the code
    this.pipelines = new Map();
    this.pipelineObjects = new Map();
    this.ballPositions = new Map(); // Track progress of balls along paths
    this.targetPositions = new Map(); // Target position for animations
    this.stepCounts = new Map(); // Track number of steps per reconcileId
    this.tubes = new Map(); // Store tube objects for each reconcileId
    this.curves = new Map(); // Store curve objects for each reconcileId
    this.balls = new Map(); // Store ball objects for each reconcileId
    this.stepMarkers = new Map(); // Store step markers for each reconcileId
    this.stepPositions = new Map(); // Store positions of steps along curves
    this.ballSpeeds = new Map(); // Track speed of each ball
    this.stepTooltips = new Map(); // Track tooltips for steps
    this.currentStepIndices = new Map(); // Track the current step index for each reconcileId
    this.stepsByReconcileId = new Map(); // Group steps by reconcileId
    this.stepsByResource = new Map(); // Group steps by resource (namespace/name)
    
    // Store clock for animations
    this.clock = new THREE.Clock();
    this.clock.start();
    
    // Store animation state
    this.animating = false;
    this.lastUpdate = Date.now();
    this.animationSpeed = 1.0;
    
    // Navigation control properties
    this.manualControl = false;
    this.isPlaying = true; // Track if automatic animation is enabled
    
    // Current step tracking for external components
    this.currentStep = null;
    
    // Track active pipeline (the one being controlled)
    this.activePipelineId = null;
    this.activePipelineColor = 0x00ffff; // Cyan color for active pipeline
    this.defaultPipelineColor = 0x4287f5; // Default blue color
    
    // Grouping mode - can be either "reconcileId" or "resource"
    this.groupingMode = "reconcileId";
    
    console.log("ReconcileFlow initialized with all collections");
  }
  
  // Set the grouping mode for pipeline visualization
  setGroupingMode(mode) {
    if (mode !== "reconcileId" && mode !== "resource") {
      console.warn(`Invalid grouping mode: ${mode}, defaulting to "reconcileId"`);
      mode = "reconcileId";
    }
    
    if (this.groupingMode !== mode) {
      console.log(`Changing grouping mode from ${this.groupingMode} to ${mode}`);
      this.groupingMode = mode;
      
      // Clear existing pipelines and their visualizations
      this.clearAllPipelines();
      
      // Re-process steps with the new grouping mode
      if (this.steps && this.steps.length > 0) {
        this.updateSteps(this.steps);
      }
      
      // Reset active pipeline
      this.activePipelineId = null;
    }
  }
  
  // Clear all existing pipeline visualizations
  clearAllPipelines() {
    console.log("Clearing all existing pipelines");
    
    // Remove all tubes and markers from the scene
    this.tubes.forEach(tube => {
      if (this.scene && tube) {
        this.scene.remove(tube);
      }
    });
    
    this.balls.forEach(ball => {
      if (this.scene && ball) {
        this.scene.remove(ball);
      }
    });
    
    this.stepMarkers.forEach(markers => {
      if (markers && Array.isArray(markers)) {
        markers.forEach(marker => {
          if (this.scene && marker) {
            this.scene.remove(marker);
          }
        });
      }
    });
    
    // Clear all tracking maps
    this.pipelineObjects.clear();
    this.pipelines.clear();
    this.tubes.clear();
    this.curves.clear();
    this.balls.clear();
    this.ballPositions.clear();
    this.targetPositions.clear();
    this.stepMarkers.clear();
    this.stepPositions.clear();
    this.currentStepIndices.clear();
    
    // Reset current step
    this.currentStep = null;
  }
  
  // Group steps by reconcileId
  getStepsByReconcileId() {
    const stepsByReconcileId = new Map();
    
    this.steps.forEach(step => {
      const reconcileId = step.reconcileId || step.reconcileID;
      if (!reconcileId) return;
      
      if (!stepsByReconcileId.has(reconcileId)) {
        stepsByReconcileId.set(reconcileId, []);
      }
      stepsByReconcileId.get(reconcileId).push(step);
    });
    
    // Sort steps by timestamp
    for (const [reconcileId, reconcileSteps] of stepsByReconcileId.entries()) {
      reconcileSteps.sort((a, b) => {
        const aTime = a.timestamp || a.ts || 0;
        const bTime = b.timestamp || b.ts || 0;
        const aTimeValue = typeof aTime === 'object' ? aTime.getTime() : new Date(aTime).getTime();
        const bTimeValue = typeof bTime === 'object' ? bTime.getTime() : new Date(bTime).getTime();
        return aTimeValue - bTimeValue;
      });
    }
    
    return stepsByReconcileId;
  }
  
  // Group steps by resource (namespace/name)
  getStepsByResource() {
    const stepsByResource = new Map();
    
    this.steps.forEach(step => {
      const namespace = step.namespace || '';
      const name = step.name || '';
      
      // Skip steps without namespace or name
      if (!namespace || !name) return;
      
      const resourceKey = `${namespace}/${name}`;
      
      if (!stepsByResource.has(resourceKey)) {
        stepsByResource.set(resourceKey, []);
      }
      stepsByResource.get(resourceKey).push(step);
    });
    
    // Sort steps by timestamp
    for (const [resourceKey, resourceSteps] of stepsByResource.entries()) {
      resourceSteps.sort((a, b) => {
        const aTime = a.timestamp || a.ts || 0;
        const bTime = b.timestamp || b.ts || 0;
        const aTimeValue = typeof aTime === 'object' ? aTime.getTime() : new Date(aTime).getTime();
        const bTimeValue = typeof bTime === 'object' ? bTime.getTime() : new Date(bTime).getTime();
        return aTimeValue - bTimeValue;
      });
    }
    
    return stepsByResource;
  }
  
  // Get steps grouped according to current grouping mode
  getGroupedSteps() {
    if (this.groupingMode === "resource") {
      return this.getStepsByResource();
    } else {
      return this.getStepsByReconcileId();
    }
  }
  
  // Initialize manual navigation mode
  initializeManualNavigation() {
    console.log("\n--- initializeManualNavigation called ---");
    
    // Only initialize if we're in manual control mode
    if (!this.manualControl) {
      console.log("Not initializing manual navigation - not in manual mode");
      return;
    }
    
    console.log("Initializing manual navigation mode");
    
    // Stop any automatic animation
    this.animating = false;
    
    // Get all reconcile IDs
    const pipelineIds = this.getPipelineIds();
    console.log(`Available pipelines: ${pipelineIds.length > 0 ? pipelineIds.join(", ") : "none"}`);
    
    if (pipelineIds.length === 0) {
      console.log("No pipelines available for manual navigation");
      return;
    }
    
    // First check if we already have an active pipeline
    if (this.activePipelineId && this.pipelineObjects.has(this.activePipelineId)) {
      console.log(`Using existing active pipeline: ${this.activePipelineId}`);
    } else {
      // If no active pipeline, select the first one
      const firstPipeline = pipelineIds[0];
      console.log(`No active pipeline - selecting first pipeline: ${firstPipeline}`);
      this.setActivePipeline(firstPipeline);
    }
    
    // Make sure all pipelines have current step indices
    for (const reconcileId of pipelineIds) {
      if (!this.currentStepIndices.has(reconcileId)) {
        console.log(`Initializing step index for pipeline ${reconcileId} to 0`);
        this.currentStepIndices.set(reconcileId, 0);
      }
    }
    
    // Make sure the active pipeline is properly set up
    if (this.activePipelineId) {
      const activePipelineId = this.activePipelineId;
      const stepsMap = this.getGroupedSteps();
      
      if (stepsMap.has(activePipelineId)) {
        const steps = stepsMap.get(activePipelineId);
        
        if (steps && steps.length > 0) {
          // Get current index (default to 0 if not set)
          const currentIndex = this.currentStepIndices.get(activePipelineId) || 0;
          
          console.log(`Setting current step to index ${currentIndex} (${currentIndex + 1}/${steps.length}) for active pipeline ${activePipelineId}`);
          
          // Update the current step object for UI components
          this.currentStep = this.enrichStepWithMetadata(
            steps[currentIndex],
            currentIndex,
            steps.length
          );
          
          // Set target position to current index to give visual feedback
          const targetPosition = currentIndex / Math.max(1, steps.length - 1);
          this.targetPositions.set(activePipelineId, targetPosition);
          
          // Enable animation to move the ball to the target position
          this.animating = true;
          
          // Flash the active pipeline ball 
          this.flashBall(activePipelineId);
        } else {
          console.log(`No steps available for active pipeline ${activePipelineId}`);
        }
      } else {
        console.log(`No step data found for active pipeline ${activePipelineId}`);
        console.log(`Step data available for: ${Array.from(stepsMap.keys()).join(', ') || "none"}`);
      }
    }
    
    console.log("Manual navigation initialized successfully");
    console.log("--- initializeManualNavigation completed ---\n");
  }
  
  // Method to move to next step in manual mode
  moveToNextStep() {
    console.log("\n--- moveToNextStep called ---");
    
    // Check if we're in manual control mode
    if (!this.manualControl) {
      console.log("Cannot move to next step - not in manual control mode");
      return;
    }
    
    // Get all available pipeline ids
    const pipelineIds = this.getPipelineIds();
    console.log(`Available pipelines: ${pipelineIds.length > 0 ? pipelineIds.join(", ") : "none"}`);
    
    if (pipelineIds.length === 0) {
      console.log("No pipelines available - cannot navigate");
      return;
    }
    
    // Get active pipeline ID or select first one if none active
    let activePipelineId = this.activePipelineId;
    if (!activePipelineId) {
      activePipelineId = pipelineIds[0];
      this.setActivePipeline(activePipelineId);
      console.log(`No active pipeline - auto-selecting first one: ${activePipelineId}`);
    }
    
    console.log(`Active pipeline ID: ${activePipelineId}`);
    
    // Get steps for the active pipeline based on grouping mode
    const stepsMap = this.getGroupedSteps();
    
    if (!stepsMap.has(activePipelineId)) {
      console.log(`No steps found for active pipeline ${activePipelineId}`);
      console.log(`Steps available for: ${Array.from(stepsMap.keys()).join(', ') || "none"}`);
      return;
    }
    
    const steps = stepsMap.get(activePipelineId);
    const totalSteps = steps.length;
    
    console.log(`Total steps: ${totalSteps}`);
    
    if (totalSteps === 0) {
      console.log(`No steps available for pipeline ${activePipelineId}`);
      return;
    }
    
    // Get current step index (default to 0 if not set)
    let currentIndex = this.currentStepIndices.get(activePipelineId);
    
    if (currentIndex === undefined) {
      currentIndex = 0;
      this.currentStepIndices.set(activePipelineId, currentIndex);
      console.log(`No current index found, defaulting to 0`);
    }
    
    console.log(`Current step index: ${currentIndex}`);
    
    // Check if we're already at the last step
    if (currentIndex >= totalSteps - 1) {
      console.log(`Already at last step (${currentIndex + 1}/${totalSteps})`);
      return;
    }
    
    // Move to next step
    const nextIndex = currentIndex + 1;
    console.log(`Moving to step index ${nextIndex}`);
    
    // Update the index
    this.currentStepIndices.set(activePipelineId, nextIndex);
    
    // Calculate position on pipeline (0 to 1)
    const newPosition = nextIndex / Math.max(1, totalSteps - 1);
    console.log(`Setting target position to ${newPosition.toFixed(3)}`);
    
    // Update target position to move ball
    this.targetPositions.set(activePipelineId, newPosition);
    
    // Enable animation to move the ball
    this.animating = true;
    
    // Update current step object for external components
    if (nextIndex < steps.length) {
      this.currentStep = this.enrichStepWithMetadata(
        steps[nextIndex], 
        nextIndex, 
        totalSteps
      );
      console.log(`Updated current step to: ${steps[nextIndex].description || steps[nextIndex].stepType}`);
    }
    
    // Flash ball to give visual feedback
    this.flashBall(activePipelineId);
    
    console.log(`Successfully moved to step ${nextIndex + 1}/${totalSteps}`);
    console.log("--- moveToNextStep completed ---\n");
  }
  
  // Method to move to previous step in manual mode
  moveToPreviousStep() {
    console.log("\n--- moveToPreviousStep called ---");
    
    // Check if we're in manual control mode
    if (!this.manualControl) {
      console.log("Cannot move to previous step - not in manual control mode");
      return;
    }
    
    // Get all available pipeline ids
    const pipelineIds = this.getPipelineIds();
    console.log(`Available pipelines: ${pipelineIds.length > 0 ? pipelineIds.join(", ") : "none"}`);
    
    if (pipelineIds.length === 0) {
      console.log("No pipelines available - cannot navigate");
      return;
    }
    
    // Get active pipeline ID or select first one if none active
    let activePipelineId = this.activePipelineId;
    if (!activePipelineId) {
      activePipelineId = pipelineIds[0];
      this.setActivePipeline(activePipelineId);
      console.log(`No active pipeline - auto-selecting first one: ${activePipelineId}`);
    }
    
    console.log(`Active pipeline ID: ${activePipelineId}`);
    
    // Get steps for the active pipeline based on grouping mode
    const stepsMap = this.getGroupedSteps();
    
    if (!stepsMap.has(activePipelineId)) {
      console.log(`No steps found for active pipeline ${activePipelineId}`);
      console.log(`Steps available for: ${Array.from(stepsMap.keys()).join(', ') || "none"}`);
      return;
    }
    
    const steps = stepsMap.get(activePipelineId);
    const totalSteps = steps.length;
    
    console.log(`Total steps: ${totalSteps}`);
    
    if (totalSteps === 0) {
      console.log(`No steps available for pipeline ${activePipelineId}`);
      return;
    }
    
    // Get current step index (default to 0 if not set)
    let currentIndex = this.currentStepIndices.get(activePipelineId);
    
    if (currentIndex === undefined) {
      currentIndex = 0;
      this.currentStepIndices.set(activePipelineId, currentIndex);
      console.log(`No current index found, defaulting to 0`);
    }
    
    console.log(`Current step index: ${currentIndex}`);
    
    // Check if we're already at the first step
    if (currentIndex <= 0) {
      console.log(`Already at first step (1/${totalSteps})`);
      return;
    }
    
    // Move to previous step
    const prevIndex = currentIndex - 1;
    console.log(`Moving to step index ${prevIndex}`);
    
    // Update the index
    this.currentStepIndices.set(activePipelineId, prevIndex);
    
    // Calculate position on pipeline (0 to 1)
    const newPosition = prevIndex / Math.max(1, totalSteps - 1);
    console.log(`Setting target position to ${newPosition.toFixed(3)}`);
    
    // Update target position to move ball
    this.targetPositions.set(activePipelineId, newPosition);
    
    // Enable animation to move the ball
    this.animating = true;
    
    // Update current step object for external components
    if (prevIndex < steps.length) {
      this.currentStep = this.enrichStepWithMetadata(
        steps[prevIndex], 
        prevIndex, 
        totalSteps
      );
      console.log(`Updated current step to: ${steps[prevIndex].description || steps[prevIndex].stepType}`);
    }
    
    // Flash ball to give visual feedback
    this.flashBall(activePipelineId);
    
    console.log(`Successfully moved to step ${prevIndex + 1}/${totalSteps}`);
    console.log("--- moveToPreviousStep completed ---\n");
  }
  
  // Flash the ball to give visual feedback for navigation
  flashBall(reconcileId) {
    const objects = this.pipelineObjects.get(reconcileId);
    if (!objects || !objects.ball) return;
    
    // Flash the ball by temporarily increasing its size
    objects.ball.scale.set(1.8, 1.8, 1.8);
    
    // Update ball color based on current step - always keep it green
    objects.ball.material.color.setHex(0x00ff00); // Green color for INFO logs
    objects.ball.material.emissive.setHex(0x00ff00);
    
    // Animate back to normal size but keep the green color
    setTimeout(() => {
      if (objects.ball) {
        objects.ball.scale.set(1, 1, 1);
      }
    }, 200);
    
    // Mark last updated time for pulse effect
    objects.ball.userData = {
      ...objects.ball.userData,
      lastUpdated: Date.now()
    };
  }
  
  // Get array of all pipeline IDs
  getPipelineIds() {
    return Array.from(this.pipelineObjects.keys());
  }

  // Modified to create distinct pipelines with offsets
  createFlowPath(offsetX, offsetY, reconcileId) {
    console.log(`Creating flow path for reconcileId: ${reconcileId.substring(0, 8)}...`);
    // Ensure collections are initialized
    if (!this.tubes) this.tubes = new Map();
    if (!this.curves) this.curves = new Map();
    if (!this.balls) this.balls = new Map();
    if (!this.ballPositions) this.ballPositions = new Map();
    if (!this.targetPositions) this.targetPositions = new Map();
    
    // Create a more visually appealing seeded random function for consistent curves
    const seededRandom = () => {
      // Use a consistent seed based on the reconcileId
      const seed = reconcileId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      return Math.abs(Math.sin(seed * 0.53) * 0.5 + 0.5); // Normalized between 0 and 1
    };
    
    // Create waypoints for a smooth, natural-looking curve
    const waypoints = [];
    const segmentCount = 20; // More segments for smoother curve
    const amplitude = 3;     // More subtle amplitude for a cleaner look
    const frequency = 0.8;   // Higher frequency for more interesting curve shape
    
    // Get the steps for this reconcileId
    const stepsForId = this.stepsByReconcileId ? this.stepsByReconcileId.get(reconcileId) || [] : [];
    const numSteps = stepsForId.length || 1;
    
    // Generate the curve with smooth waypoints
    for (let i = 0; i <= segmentCount; i++) {
      const t = i / segmentCount;
      const x = offsetX + t * 30; // Longer horizontal extension
      
      // Create a more natural curve using combination of sine functions
      const y = offsetY + 
        Math.sin(t * Math.PI * frequency) * amplitude * seededRandom() +
        Math.sin(t * Math.PI * 2 * frequency) * (amplitude/2) * seededRandom();
      
      waypoints.push(new THREE.Vector3(x, y, 0));
    }
    
    // Create a smooth curve using Catmull-Rom spline
    const curve = new THREE.CatmullRomCurve3(waypoints);
    curve.tension = 0.3; // Adjust tension for smoother curve
    this.curves.set(reconcileId, curve);
    
    console.log(`Created curve with ${waypoints.length} points for pipeline ${reconcileId.substring(0, 8)}...`);
    
    // Create tube geometry along the curve with improved parameters
    const tubeGeometry = new THREE.TubeGeometry(
      curve,           // The curve to follow
      100,             // tubularSegments - more segments for smoother tube
      0.25,            // radius - slightly larger for better visibility
      12,              // radialSegments - more segments for smoother tube
      false            // closed - open-ended tube
    );
    
    // Create a better-looking material
    const tubeMaterial = new THREE.MeshStandardMaterial({
      color: this.defaultPipelineColor,
      transparent: true,
      opacity: 0.6,
      emissive: this.defaultPipelineColor,
      emissiveIntensity: 0.3,
      roughness: 0.4,
      metalness: 0.6
    });
    
    // Create and add the tube to the scene
    const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
    if (this.scene) {
      this.scene.add(tube);
      console.log(`Tube added to scene with radius ${tubeGeometry.parameters.radius}`);
    } else {
      console.warn("Scene not available - tube won't be visible");
    }
    
    this.tubes.set(reconcileId, tube);
    
    // Create a larger green ball to follow the path (for INFO logs)
    const ballGeometry = new THREE.SphereGeometry(0.8, 32, 32); // Increased size from 0.4 to 0.8
    const ballMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x00ff00, // Green color for INFO logs
      emissive: 0x00ff00, // Green emissive for better visibility
      emissiveIntensity: 0.6,
      roughness: 0.3,
      metalness: 0.7
    });
    
    const ball = new THREE.Mesh(ballGeometry, ballMaterial);
    if (this.scene) {
      this.scene.add(ball);
      console.log(`Ball added to scene with radius ${ballGeometry.parameters.radius}`);
    }
    
    // Position the ball at the start of the tube
    const startPoint = curve.getPointAt(0);
    ball.position.copy(startPoint);
    
    // Store the ball and initialize positions
    this.balls.set(reconcileId, ball);
    this.ballPositions.set(reconcileId, 0);
    this.targetPositions.set(reconcileId, 0); // Initially set to start position
    
    // Create object to store everything related to this pipeline
    const pathObjects = { curve, tube, ball };
    
    return pathObjects;
  }
  
  // Helper method to get the curve for a specific reconcileId
  getCurveForReconcileId(reconcileId) {
    // Check existing collections first
    if (this.curves && this.curves.has(reconcileId)) {
      // Return the existing curve
      return this.curves.get(reconcileId);
    }
    
    // Check pipelines collection next
    if (this.pipelines && this.pipelines.has(reconcileId)) {
      // Return the existing curve from pipelines
      return this.pipelines.get(reconcileId);
    }
    
    console.log(`Creating new curve for pipeline ${reconcileId.substring(0, 8)}...`);
    
    // Calculate the index of this reconcileId to determine offset
    const pipelineIndex = this.pipelines ? this.pipelines.size : 0;
    const offsetY = pipelineIndex * 4; // Space pipelines vertically
    
    // Create a new curve and tube for this reconcileId with offset
    const pathObjects = this.createFlowPath(0, offsetY, reconcileId);
    
    // Store in all relevant collections
    this.pipelines.set(reconcileId, pathObjects.curve);
    this.tubes.set(reconcileId, pathObjects.tube);
    this.curves.set(reconcileId, pathObjects.curve);
    
    // Add to scene
    if (this.flowGroup && pathObjects.tube) {
      this.flowGroup.add(pathObjects.tube);
    }
    
    return pathObjects.curve;
  }

  updateSteps(steps) {
    console.log(`Updating steps: ${steps.length} steps received`);
    
    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      console.warn("No valid steps provided to updateSteps");
      return;
    }
    
    // Store the full steps array
    this.steps = steps;
    
    // Ensure collections are initialized
    if (!this.tubes) this.tubes = new Map();
    if (!this.curves) this.curves = new Map();
    if (!this.balls) this.balls = new Map();
    if (!this.pipelineObjects) this.pipelineObjects = new Map();
    if (!this.stepsByReconcileId) this.stepsByReconcileId = new Map();
    if (!this.stepsByResource) this.stepsByResource = new Map();
    if (!this.stepMarkers) this.stepMarkers = new Map();
    if (!this.stepPositions) this.stepPositions = new Map();
    
    // Group steps based on current grouping mode
    let groupedSteps;
    if (this.groupingMode === "resource") {
      groupedSteps = this.getStepsByResource();
      this.stepsByResource = groupedSteps;
    } else {
      groupedSteps = this.getStepsByReconcileId();
      this.stepsByReconcileId = groupedSteps;
    }
    
    console.log(`Grouped into ${groupedSteps.size} pipelines using ${this.groupingMode} mode`);
    
    // Process each group
    let offsetX = -15;
    let offsetY = 5;
    
    // Loop through each group of steps
    for (const [groupKey, stepsForGroup] of groupedSteps.entries()) {
      // Check if we have a pipeline object already for this group key
      const hasPipelineObject = 
        (this.pipelineObjects && this.pipelineObjects.has(groupKey)) ||
        (this.tubes && this.tubes.has(groupKey)) ||
        (this.curves && this.curves.has(groupKey)) ||
        (this.pipelines && this.pipelines.has(groupKey));
        
      if (hasPipelineObject) {
        console.log(`Pipeline ${groupKey.substring(0, 20)}... already exists, ensuring visibility`);
        
        // Ensure tube is visible
        if (this.tubes && this.tubes.has(groupKey)) {
          const tube = this.tubes.get(groupKey);
          if (tube && !tube.visible) {
            console.log(`Making tube visible for existing pipeline: ${groupKey.substring(0, 20)}...`);
            tube.visible = true;
          }
        }
        
        // Ensure we have a curve for this pipeline
        let curve;
        if (this.curves && this.curves.has(groupKey)) {
          curve = this.curves.get(groupKey);
        } else if (this.pipelines && this.pipelines.has(groupKey)) {
          curve = this.pipelines.get(groupKey);
        } else if (this.pipelineObjects && this.pipelineObjects.has(groupKey)) {
          curve = this.pipelineObjects.get(groupKey).curve;
        }
        
        // Update the step markers using the existing curve
        if (curve) {
          this.createStepMarkers(stepsForGroup, groupKey, curve);
        } else {
          console.warn(`No curve found for existing pipeline ${groupKey.substring(0, 20)}...`);
        }
        
        continue;
      }
      
      console.log(`Creating new pipeline for ${groupKey.substring(0, 20)}... with ${stepsForGroup.length} steps`);
      
      // Sort steps by timestamp to ensure they're in chronological order
      stepsForGroup.sort((a, b) => {
        const aTime = a.timestamp || a.ts || 0;
        const bTime = b.timestamp || b.ts || 0;
        const aTimeValue = typeof aTime === 'object' ? aTime.getTime() : new Date(aTime).getTime();
        const bTimeValue = typeof bTime === 'object' ? bTime.getTime() : new Date(bTime).getTime();
        return aTimeValue - bTimeValue;
      });
      
      // Create new flow path for this group
      const pathObjects = this.createFlowPath(offsetX, offsetY, groupKey);
      
      // Store the path objects for this group
      this.pipelineObjects.set(groupKey, pathObjects);
      
      // Also ensure the curve is stored in the curves collection
      this.curves.set(groupKey, pathObjects.curve);
      this.pipelines.set(groupKey, pathObjects.curve);
      
      // Offset for next pipeline
      offsetY -= 5;
      
      // Reset X if we've gone too far down
      if (offsetY < -15) {
        offsetY = 5;
        offsetX += 30; // More horizontal space between pipelines
      }
      
      // Create markers for each step in this pipeline
      this.createStepMarkers(stepsForGroup, groupKey, pathObjects.curve);
    }
    
    // If there's no active pipeline yet but we have pipelines, select the first one
    if (!this.activePipelineId && groupedSteps.size > 0) {
      const firstPipelineId = Array.from(groupedSteps.keys())[0];
      console.log(`No active pipeline, selecting first one: ${firstPipelineId.substring(0, 20)}...`);
      this.setActivePipeline(firstPipelineId);
    }
    
    // Call ensure tubes are visible to make sure all tubes are visible
    this.ensureTubesAreVisible();
  }
  
  // Create markers to visualize each step along the curve
  createStepMarkers(steps, reconcileId, curve) {
    console.log(`Creating ${steps.length} step markers for pipeline ${reconcileId.substring(0, 8)}...`);
    
    if (!steps || steps.length === 0 || !curve) {
      console.warn("Missing data for creating step markers");
      return;
    }
    
    // Initialize collections if needed
    if (!this.stepMarkers) this.stepMarkers = new Map();
    if (!this.stepPositions) this.stepPositions = new Map();
    
    // Remove any existing markers for this reconcileId
    if (this.stepMarkers.has(reconcileId)) {
      const existingMarkers = this.stepMarkers.get(reconcileId);
      if (Array.isArray(existingMarkers)) {
        for (const marker of existingMarkers) {
          if (marker && this.scene) {
            this.scene.remove(marker);
          }
        }
      }
    }
    
    // Create new arrays to store markers and positions
    const markers = [];
    const positions = [];
    
    // Calculate positions and create markers for each step
    for (let i = 0; i < steps.length; i++) {
      // Position along the curve (0 to 1)
      const t = i / Math.max(steps.length - 1, 1);
      positions.push(t);
      
      // Get point on curve
      const point = curve.getPointAt(t);
      
      // Create a cube marker for this step
      const markerGeometry = new THREE.BoxGeometry(0.3, 0.3, 0.3); // Small cube
      const markerMaterial = new THREE.MeshStandardMaterial({ 
        color: this.getColorForStatus(steps[i].status || 'default'),
        emissive: this.getColorForStatus(steps[i].status || 'default'),
        emissiveIntensity: 0.5,
        roughness: 0.3,
        metalness: 0.7
      });
      
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.copy(point);
      
      // Slightly offset the cube from the tube
      const offsetAmount = 0.3;
      if (i % 2 === 0) {
        marker.position.y += offsetAmount;
      } else {
        marker.position.y -= offsetAmount;
      }
      
      // Add marker to scene
      if (this.scene) {
        this.scene.add(marker);
      }
      
      markers.push(marker);
    }
    
    // Store the markers and positions
    this.stepMarkers.set(reconcileId, markers);
    this.stepPositions.set(reconcileId, positions);
    
    console.log(`Created ${markers.length} cube markers for ${steps.length} steps`);
  }
  
  // Update existing step markers (for when steps change)
  updateStepMarkers(steps, reconcileId) {
    if (!this.pipelineObjects || !this.pipelineObjects.has(reconcileId)) {
      console.warn(`Cannot update step markers - pipeline ${reconcileId.substring(0, 8)}... not found`);
      return;
    }
    
    const { curve } = this.pipelineObjects.get(reconcileId);
    if (curve) {
      this.createStepMarkers(steps, reconcileId, curve);
    }
  }
  
  update(speed) {
    // Skip updates if no scene
    if (!this.scene) return;
    
    // Calculate time delta
    const now = Date.now();
    const delta = (now - this.lastUpdate) / 1000; // Convert to seconds
    this.lastUpdate = now;
    
    // Apply animation speed multiplier
    const adjustedDelta = delta * speed * this.animationSpeed;
    
    // Only update positions if animating
    if (this.animating) {
      // Check if collections are initialized
      if (!this.targetPositions) this.targetPositions = new Map();
      if (!this.ballPositions) this.ballPositions = new Map();
      if (!this.balls) this.balls = new Map();
      
      // Process each ball with its target position
      for (const [reconcileId, targetPos] of this.targetPositions.entries()) {
        // Skip if we don't have current position tracking for this reconcileId
        if (!this.ballPositions.has(reconcileId)) {
          console.warn(`No current position data for pipeline ${reconcileId.substring(0, 8)}...`);
          this.ballPositions.set(reconcileId, 0);
          continue;
        }
        
        // Get current position and calculate distance to target
        const currentPos = this.ballPositions.get(reconcileId);
        const distanceToTarget = Math.abs(targetPos - currentPos);
        
        // Skip animation if distance is too small
        if (distanceToTarget < 0.001) {
          continue;
        }
        
        // Speed controls how quickly the ball moves
        // Adjust the step size based on distance to target for smoother starts/stops
        const minStep = 0.0005; // Minimum step
        const maxStep = 0.003; // Maximum step
        const dynamicStep = Math.min(maxStep, distanceToTarget * 0.1 + minStep);
        const step = dynamicStep * adjustedDelta * 60; // Normalize to 60fps
        
        // Determine direction (positive or negative)
        const direction = targetPos > currentPos ? 1 : -1;
        
        // Calculate new position with easing for smoother motion
        const newPos = currentPos + direction * Math.min(step, distanceToTarget);
        
        // Get the curve for this reconcileId
        const curve = this.getCurveForReconcileId(reconcileId);
        if (!curve) {
          console.warn(`No curve found for pipeline ${reconcileId.substring(0, 8)}...`);
          continue;
        }
        
        // Update ball position on curve
        if (this.balls.has(reconcileId)) {
          const ball = this.balls.get(reconcileId);
          
          // Calculate position on curve
          const position = curve.getPointAt(newPos);
          
          // Calculate tangent for ball rotation (optional)
          const tangent = curve.getTangentAt(newPos);
          
          // Apply position and optional rotation to ball
          ball.position.copy(position);
          
          // Optionally orient ball along curve
          if (tangent) {
            const axis = new THREE.Vector3(0, 0, 1);
            ball.quaternion.setFromUnitVectors(axis, tangent.normalize());
          }
          
          // Store the updated position
          this.ballPositions.set(reconcileId, newPos);
        }
      }
      
      // Check if animation should stop (all balls at their targets)
      let allAtTarget = true;
      for (const [rid, tPos] of this.targetPositions.entries()) {
        const cPos = this.ballPositions.get(rid) || 0;
        if (Math.abs(tPos - cPos) > 0.001) {
          allAtTarget = false;
          break;
        }
      }
      
      // Stop animation if all balls have reached their targets
      if (allAtTarget && !this.isPlaying) {
        this.animating = false;
        
        // Update current step for external components
        this.currentStep = this.getCurrentStep();
      }
    }
    
    // Always ensure tubes are visible
    this.ensureTubesAreVisible();
  }
  
  // Method to ensure all tubes remain visible
  ensureTubesAreVisible() {
    // Check if tubes is defined
    if (!this.tubes) {
      console.warn("Tubes collection is not initialized");
      this.tubes = new Map();
      return;
    }
    
    if (this.tubes.size === 0) {
      console.log("No tubes to ensure visibility for");
      return;
    }
    
    // Iterate through all tubes
    for (const [reconcileId, tube] of this.tubes.entries()) {
      // Check if tube exists
      if (!tube) {
        console.warn(`Tube for pipeline ${reconcileId.substring(0, 8)}... does not exist`);
        continue;
      }
      
      // Make sure tube is visible
      if (!tube.visible) {
        console.log(`Tube for pipeline ${reconcileId.substring(0, 8)}... was invisible - making visible again`);
        tube.visible = true;
      }
      
      // Make sure the material exists
      if (!tube.material) {
        console.warn(`Tube for pipeline ${reconcileId.substring(0, 8)}... has no material`);
        continue;
      }
      
      // Make sure active tube has correct appearance
      if (reconcileId === this.activePipelineId) {
        // Set active pipeline appearance
        tube.material.color.setHex(0x00ffff); // Bright cyan
        tube.material.opacity = 0.9;
        tube.material.emissiveIntensity = 0.8;
      } else {
        // Non-active tubes should have default appearance
        tube.material.color.setHex(this.defaultPipelineColor);
        tube.material.opacity = 0.6;
        tube.material.emissiveIntensity = 0.3;
      }
    }
  }
  
  // Get color based on status
  getColorForStatus(status) {
    switch (status) {
      case 'started':
      case 'reconcile-start':
        return 0x00ff00; // Bright pure green
      case 'completed':
      case 'reconcile-complete':
        return 0x00ff00; // Bright pure green
      case 'failed':
        return 0x00ff00; // Bright pure green
      case 'reconcile-error':
        return 0xff0000; // Pure red for better visibility
      default:
        return 0x00ff00; // Bright pure green
    }
  }
  
  // Get the current step (for UI components)
  getCurrentStep() {
    // If we're in manual control, use the indices from manualControl
    if (this.manualControl && this.activePipelineId) {
      // Get steps for the active pipeline based on grouping mode
      const stepsMap = this.getGroupedSteps();
      
      if (stepsMap.has(this.activePipelineId)) {
        const steps = stepsMap.get(this.activePipelineId);
        const currentIndex = this.currentStepIndices.get(this.activePipelineId) || 0;
        
        if (steps && steps.length > currentIndex) {
          const step = steps[currentIndex];
          return this.enrichStepWithMetadata(step, currentIndex, steps.length);
        } else {
          console.warn(`Invalid step index ${currentIndex} for pipeline ${this.activePipelineId}`);
        }
      } else {
        console.warn(`No steps found for active pipeline ${this.activePipelineId}`);
      }
    }
    
    // For auto mode, find the current step based on ball positions
    if (this.ballPositions && this.ballPositions.size > 0) {
      // Get steps based on current grouping mode
      const stepsMap = this.getGroupedSteps();
      
      // If we have an active pipeline with steps, use that
      if (this.activePipelineId && stepsMap.has(this.activePipelineId)) {
        const steps = stepsMap.get(this.activePipelineId);
        
        // If we have a position for this pipeline, find the closest step
        if (this.ballPositions.has(this.activePipelineId)) {
          const currentPos = this.ballPositions.get(this.activePipelineId);
          
          // Find the closest step to the current position
          const stepCount = steps.length;
          let closestIndex = 0;
          let closestDistance = 1;
          
          for (let i = 0; i < stepCount; i++) {
            const stepPosition = i / Math.max(stepCount - 1, 1);
            const distance = Math.abs(currentPos - stepPosition);
            if (distance < closestDistance) {
              closestDistance = distance;
              closestIndex = i;
            }
          }
          
          if (steps[closestIndex]) {
            const step = steps[closestIndex];
            return this.enrichStepWithMetadata(step, closestIndex, steps.length);
          }
        }
      }
      
      // If no active pipeline or it doesn't have valid steps, fall back to first pipeline with steps
      for (const [pipelineId, currentPos] of this.ballPositions.entries()) {
        if (stepsMap.has(pipelineId)) {
          const steps = stepsMap.get(pipelineId);
          
          // Find the closest step to the current position
          const stepCount = steps.length;
          let closestIndex = 0;
          let closestDistance = 1;
          
          for (let i = 0; i < stepCount; i++) {
            const stepPosition = i / Math.max(stepCount - 1, 1);
            const distance = Math.abs(currentPos - stepPosition);
            if (distance < closestDistance) {
              closestDistance = distance;
              closestIndex = i;
            }
          }
          
          if (steps[closestIndex]) {
            const step = steps[closestIndex];
            return this.enrichStepWithMetadata(step, closestIndex, steps.length);
          }
        }
      }
    }
    
    // Fall back to current tracked step if available
    return this.currentStep;
  }
  
  // Add metadata to a step object for display purposes
  enrichStepWithMetadata(step, index, totalSteps) {
    // Create a copy with additional metadata
    const enrichedStep = { ...step };
    
    // Add step number and total steps count
    enrichedStep.metadata = {
      stepNumber: index + 1,
      totalSteps: totalSteps
    };
    
    // Ensure these fields are explicitly copied
    const fieldsToPreserve = [
      'controller', 'namespace', 'name', 'controllerGroup', 'controllerKind',
      'level', 'msg', 'description', 'HostedCluster', 'ts'
    ];
    
    fieldsToPreserve.forEach(field => {
      if (step[field] !== undefined) {
        enrichedStep[field] = step[field];
      }
    });
    
    // Store as current step
    this.currentStep = enrichedStep;
    
    // Add additional debug log
    // console.log('Enriched step data:', {
    //   controller: enrichedStep.controller,
    //   namespace: enrichedStep.namespace,
    //   name: enrichedStep.name,
    //   controllerGroup: enrichedStep.controllerGroup,
    //   controllerKind: enrichedStep.controllerKind
    // });
    
    return enrichedStep;
  }

  // Set the active pipeline and highlight it
  setActivePipeline(pipelineId) {
    console.log("\n--- setActivePipeline called ---");
    
    // Skip if already active
    if (this.activePipelineId === pipelineId) {
      console.log(`Pipeline ${pipelineId} is already active`);
      return true;
    }
    
    // Check if the pipeline exists in any collection
    const pipelineExists = 
      (this.pipelineObjects && this.pipelineObjects.has(pipelineId)) ||
      (this.tubes && this.tubes.has(pipelineId)) ||
      (this.curves && this.curves.has(pipelineId)) ||
      (this.pipelines && this.pipelines.has(pipelineId));
      
    if (!pipelineExists) {
      console.error(`Pipeline ${pipelineId} not found in any collection`);
      
      // Log available pipelines
      console.log("Available pipelines:");
      if (this.pipelineObjects) console.log(`Pipeline objects: ${Array.from(this.pipelineObjects.keys()).join(', ') || "none"}`);
      if (this.tubes) console.log(`Tubes: ${Array.from(this.tubes.keys()).join(', ') || "none"}`);
      if (this.curves) console.log(`Curves: ${Array.from(this.curves.keys()).join(', ') || "none"}`);
      if (this.pipelines) console.log(`Pipelines: ${Array.from(this.pipelines.keys()).join(', ') || "none"}`);
      
      return false;
    }
    
    // Reset previous active pipeline
    if (this.activePipelineId && this.tubes.has(this.activePipelineId)) {
      const prevTube = this.tubes.get(this.activePipelineId);
      if (prevTube && prevTube.material) {
        console.log(`Resetting previous active pipeline: ${this.activePipelineId.substring(0, 20)}...`);
        prevTube.material.color.setHex(this.defaultPipelineColor);
        prevTube.material.emissive.setHex(this.defaultPipelineColor);
        prevTube.material.emissiveIntensity = 0.3;
      }
    }
    
    // Set new active pipeline
    this.activePipelineId = pipelineId;
    console.log(`Set active pipeline to: ${pipelineId.substring(0, 20)}...`);
    
    // Highlight new active pipeline
    if (this.tubes.has(pipelineId)) {
      const tube = this.tubes.get(pipelineId);
      if (tube && tube.material) {
        console.log("Highlighting active pipeline");
        tube.material.color.setHex(this.activePipelineColor);
        tube.material.emissive.setHex(this.activePipelineColor);
        tube.material.emissiveIntensity = 0.6;
      }
    }
    
    // If we're in manual mode, update current step
    if (this.manualControl) {
      console.log("Updating current step for manual mode");
      
      // Get steps for the active pipeline based on grouping mode
      const stepsMap = this.getGroupedSteps();
      
      if (stepsMap.has(pipelineId)) {
        const steps = stepsMap.get(pipelineId);
        
        if (steps && steps.length > 0) {
          // Get current step index or default to first step
          let currentIndex = this.currentStepIndices.get(pipelineId);
          if (currentIndex === undefined) {
            currentIndex = 0;
            this.currentStepIndices.set(pipelineId, currentIndex);
            console.log(`Initializing step index for pipeline ${pipelineId} to 0`);
          }
          
          // Update current step data for external components
          if (currentIndex < steps.length) {
            this.currentStep = this.enrichStepWithMetadata(
              steps[currentIndex],
              currentIndex,
              steps.length
            );
            
            console.log(`Set active pipeline step to ${currentIndex + 1}/${steps.length}`);
            
            // Make ball move to the current step position
            const targetPosition = currentIndex / Math.max(1, steps.length - 1);
            this.targetPositions.set(pipelineId, targetPosition);
            
            // Activate animation to move ball
            this.animating = true;
          }
        } else {
          console.log(`No steps available for pipeline ${pipelineId}`);
        }
      } else {
        console.log(`No step data found for pipeline ${pipelineId}`);
        console.log(`Step data available for: ${Array.from(stepsMap.keys()).join(', ') || "none"}`);
      }
    }
    
    console.log("--- setActivePipeline completed ---\n");
    return true;
  }
}

export default ReconcileFlow;   