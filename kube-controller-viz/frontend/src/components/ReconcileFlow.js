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
    
    // Add reconcile flow label
    const flowLabel = createTextLabel('Reconcile Flow', { x: 0, y: 6, z: 0 }, 1.2);
    this.flowGroup.add(flowLabel);
    
    // Add flow container - make it larger for better visualization
    const flowGeometry = new THREE.BoxGeometry(22, 20, 2);
    const flowMaterial = new THREE.MeshPhongMaterial({ 
      color: 0x0f3460,
      transparent: true,
      opacity: 0.5,
      wireframe: false
    });
    this.flowContainer = new THREE.Mesh(flowGeometry, flowMaterial);
    this.flowGroup.add(this.flowContainer);
    
    // Track pipelines and animations by reconcileId
    this.pipelines = new Map();
    this.pipelineObjects = new Map();
    this.ballPositions = new Map(); // Track progress of balls along paths
    this.targetPositions = new Map(); // Target position for animations
    this.stepCounts = new Map(); // Track number of steps per reconcileId
    
    // Store clock for animations
    this.clock = new THREE.Clock();
    this.clock.start();
    
    // Store animation state
    this.animating = true;
    this.lastUpdate = Date.now();
    this.animationSpeed = 1;
    
    // Navigation control properties
    this.manualControl = false;
    this.currentStepIndices = new Map(); // Track the current step index for each reconcileId
    this.isPlaying = true; // Track if automatic animation is enabled
    
    // Set up keyboard event listeners
    this.setupKeyboardControls();
  }
  
  // Add keyboard controls for navigating through steps
  setupKeyboardControls() {
    document.addEventListener('keydown', (event) => {
      switch (event.key) {
        case 'ArrowRight':
          // Move to next step
          if (this.manualControl) {
            this.moveToNextStep();
          }
          break;
        case 'ArrowLeft':
          // Move to previous step
          if (this.manualControl) {
            this.moveToPreviousStep();
          }
          break;
        case ' ': // Spacebar
          // Toggle between auto and manual control
          this.manualControl = !this.manualControl;
          this.isPlaying = !this.manualControl;
          
          // If switching to manual control, initialize current step indices
          if (this.manualControl) {
            this.initializeManualNavigation();
          }
          break;
      }
    });
  }
  
  // Initialize manual navigation mode
  initializeManualNavigation() {
    // Initialize current step index for each pipeline if not already set
    for (const [reconcileId, steps] of this.getStepsByReconcileId().entries()) {
      if (!this.currentStepIndices.has(reconcileId)) {
        // Find the current position based on ball position
        const currentPos = this.ballPositions.get(reconcileId) || 0;
        
        // Convert to step index (find closest step)
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
        
        this.currentStepIndices.set(reconcileId, closestIndex);
      }
    }
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
  
  // Move to the next step
  moveToNextStep() {
    for (const [reconcileId, currentIndex] of this.currentStepIndices.entries()) {
      const steps = this.getStepsByReconcileId().get(reconcileId) || [];
      if (steps.length === 0) continue;
      
      // Move to next step if not at the end
      if (currentIndex < steps.length - 1) {
        const newIndex = currentIndex + 1;
        this.currentStepIndices.set(reconcileId, newIndex);
        
        // Update target position
        const targetPos = newIndex / Math.max(steps.length - 1, 1);
        this.targetPositions.set(reconcileId, targetPos);
        
        // Force animation
        this.animating = true;
        
        // Flash the ball
        this.flashBall(reconcileId);
      }
    }
  }
  
  // Move to the previous step
  moveToPreviousStep() {
    for (const [reconcileId, currentIndex] of this.currentStepIndices.entries()) {
      const steps = this.getStepsByReconcileId().get(reconcileId) || [];
      if (steps.length === 0) continue;
      
      // Move to previous step if not at the beginning
      if (currentIndex > 0) {
        const newIndex = currentIndex - 1;
        this.currentStepIndices.set(reconcileId, newIndex);
        
        // Update target position
        const targetPos = newIndex / Math.max(steps.length - 1, 1);
        this.targetPositions.set(reconcileId, targetPos);
        
        // Force animation
        this.animating = true;
        
        // Flash the ball
        this.flashBall(reconcileId);
      }
    }
  }
  
  // Flash the ball to give visual feedback for navigation
  flashBall(reconcileId) {
    const objects = this.pipelineObjects.get(reconcileId);
    if (!objects || !objects.ball) return;
    
    // Flash the ball by temporarily increasing its size
    objects.ball.scale.set(1.8, 1.8, 1.8);
    
    // Update ball color based on current step
    const steps = this.getStepsByReconcileId().get(reconcileId) || [];
    const currentIndex = this.currentStepIndices.get(reconcileId) || 0;
    if (steps[currentIndex] && steps[currentIndex].status) {
      objects.ball.material.color.set(this.getColorForStatus(steps[currentIndex].status));
    }
    
    // Animate back to normal size
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
  
  createFlowPath(offsetX, offsetY) {
    // Create a straighter and longer path for better visualization of progress
    const pathLength = 18; // Even longer path for more visible movement
    const points = [];
    
    // Generate a path that's more of a horizontal line with gentle undulation
    for (let i = 0; i <= 20; i++) { // More points for smoother curve
      const t = i / 20;
      const x = offsetX + (t * pathLength - pathLength/2);
      // Less vertical variation for clearer forward motion
      const y = offsetY - (Math.sin(t * Math.PI * 1.5) * 0.8); 
      points.push(new THREE.Vector3(x, y, 0.5));
    }
    
    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve, 100, 0.15, 10, false); // Wider tube
    const material = new THREE.MeshPhongMaterial({ color: 0x00b4d8 });
    const tube = new THREE.Mesh(geometry, material);
    
    return { curve, tube };
  }
  
  updateSteps(steps) {
    // Save the old step counts before updating
    const oldStepCounts = new Map(this.stepCounts);
    
    // Ensure all raw log data is preserved in step objects
    this.steps = steps.map(step => {
      // If the step already has all fields, return it as is
      if (step.rawData) return step;
      
      // Otherwise create a copy with all fields preserved
      const enrichedStep = { ...step, rawData: true };
      
      // Normalize reconcileId field (handle both reconcileId and reconcileID)
      if (!enrichedStep.reconcileId && enrichedStep.reconcileID) {
        enrichedStep.reconcileId = enrichedStep.reconcileID;
      }
      
      // Normalize timestamp field (handle both timestamp and ts)
      if (!enrichedStep.timestamp && enrichedStep.ts) {
        enrichedStep.timestamp = enrichedStep.ts;
      }
      
      return enrichedStep;
    });
    
    // Group steps by reconcileId
    const stepsByReconcileId = new Map();
    this.steps.forEach(step => {
      // Use either reconcileId or reconcileID
      const reconcileId = step.reconcileId || step.reconcileID;
      if (!reconcileId) return; // Skip steps without reconcileId
      
      if (!stepsByReconcileId.has(reconcileId)) {
        stepsByReconcileId.set(reconcileId, []);
      }
      stepsByReconcileId.get(reconcileId).push(step);
    });
    
    // Update step counts
    this.stepCounts.clear();
    for (const [reconcileId, reconcileSteps] of stepsByReconcileId.entries()) {
      this.stepCounts.set(reconcileId, reconcileSteps.length);
    }
    
    // Sort steps by timestamp within each reconcileId
    for (const [reconcileId, reconcileSteps] of stepsByReconcileId.entries()) {
      reconcileSteps.sort((a, b) => {
        // Use either timestamp or ts field
        const aTime = a.timestamp || a.ts || 0;
        const bTime = b.timestamp || b.ts || 0;
        // Handle both Date objects and timestamp strings
        const aTimeValue = typeof aTime === 'object' ? aTime.getTime() : new Date(aTime).getTime();
        const bTimeValue = typeof bTime === 'object' ? bTime.getTime() : new Date(bTime).getTime();
        return aTimeValue - bTimeValue;
      });
    }
    
    // Remove old pipelines and objects
    for (const [reconcileId, objects] of this.pipelineObjects.entries()) {
      if (!stepsByReconcileId.has(reconcileId)) {
        // Remove this pipeline and all its objects
        this.flowGroup.remove(objects.tube);
        if (objects.ball) this.flowGroup.remove(objects.ball);
        if (objects.label) this.flowGroup.remove(objects.label);
        if (objects.infoLabel) this.flowGroup.remove(objects.infoLabel);
        if (objects.progressIndicator) this.flowGroup.remove(objects.progressIndicator);
        
        // Remove step objects associated with this pipeline
        for (const [stepId, stepObj] of this.stepObjects.entries()) {
          if (stepId.includes(reconcileId)) {
            this.flowGroup.remove(stepObj);
            // Remove the step number label if it exists
            if (stepObj.userData && stepObj.userData.label) {
              this.flowGroup.remove(stepObj.userData.label);
            }
            // Remove the info label if it exists
            if (stepObj.userData && stepObj.userData.infoLabel) {
              this.flowGroup.remove(stepObj.userData.infoLabel);
            }
            this.stepObjects.delete(stepId);
          }
        }
        
        this.pipelineObjects.delete(reconcileId);
        this.pipelines.delete(reconcileId);
        this.ballPositions.delete(reconcileId);
        this.targetPositions.delete(reconcileId);
        this.stepCounts.delete(reconcileId);
      }
    }
    
    // Calculate how many pipelines to display
    const totalPipelines = stepsByReconcileId.size;
    const pipelineSpacing = 4.5; // Increased spacing between pipelines for better readability
    
    // Update or create pipelines for each reconcileId
    let pipelineIndex = 0;
    for (const [reconcileId, reconcileSteps] of stepsByReconcileId.entries()) {
      // Calculate offset for this pipeline
      const offsetX = 0; // Keep all pipelines centered horizontally
      const offsetY = (pipelineIndex - (totalPipelines - 1) / 2) * pipelineSpacing;
      
      // Check if steps count increased since last update
      const oldCount = oldStepCounts.get(reconcileId) || 0;
      const newCount = reconcileSteps.length;
      const stepsAdded = newCount > oldCount;
      
      // Adjust target position based on actual step count
      // Use a scale of 0.0 to 1.0 for the pipeline
      const targetPos = Math.min(1.0, newCount / Math.max(newCount, 11));
      
      // Create or update pipeline
      if (!this.pipelines.has(reconcileId)) {
        // Create new pipeline
        const { curve, tube } = this.createFlowPath(offsetX, offsetY);
        this.pipelines.set(reconcileId, curve);
        this.pipelineObjects.set(reconcileId, { tube });
        this.flowGroup.add(tube);
        
        // Add reconcileId label
        const shortReconcileId = reconcileId.substring(0, 8) + '...';
        const idLabel = createTextLabel(`ID: ${shortReconcileId}`, 
          { x: -7, y: offsetY, z: 0.5 }, 0.5);
        this.flowGroup.add(idLabel);
        this.pipelineObjects.get(reconcileId).label = idLabel;
        
        // Add step counter to show progress
        const progressText = `Steps: ${newCount}`;
        const progressIndicator = createTextLabel(progressText, 
          { x: 7, y: offsetY, z: 0.5 }, 0.5);
        this.flowGroup.add(progressIndicator);
        this.pipelineObjects.get(reconcileId).progressIndicator = progressIndicator;
        
        // Initialize ball position
        this.ballPositions.set(reconcileId, 0);
        this.targetPositions.set(reconcileId, targetPos);
        
        // Create a larger, more prominent ball
        const ballGeometry = new THREE.SphereGeometry(0.5, 32, 32);
        const ballMaterial = new THREE.MeshPhongMaterial({
          color: this.getColorForStatus(reconcileSteps[0]?.status || 'default'),
          shininess: 80
        });
        const ball = new THREE.Mesh(ballGeometry, ballMaterial);
        
        // Position ball at the start of the pipeline
        const startPos = curve.getPoint(0);
        ball.position.copy(startPos);
        
        this.flowGroup.add(ball);
        this.pipelineObjects.get(reconcileId).ball = ball;
        
        // Flag as needing animation
        this.animating = true;
      } else {
        // Update existing pipeline
        const pipelineObj = this.pipelineObjects.get(reconcileId);
        
        // Update target position
        this.targetPositions.set(reconcileId, targetPos);
        
        // Update step counter
        if (pipelineObj.progressIndicator) {
          this.flowGroup.remove(pipelineObj.progressIndicator);
          const progressText = `Steps: ${newCount}`;
          const progressIndicator = createTextLabel(progressText, 
            { x: 7, y: offsetY, z: 0.5 }, 0.5);
          this.flowGroup.add(progressIndicator);
          pipelineObj.progressIndicator = progressIndicator;
        }
        
        // Update ball color based on last step status
        if (pipelineObj.ball && reconcileSteps.length > 0) {
          const lastStep = reconcileSteps[reconcileSteps.length - 1];
          pipelineObj.ball.material.color.set(this.getColorForStatus(lastStep.status));
          
          // If steps were added, make the ball flash briefly to indicate new data
          if (stepsAdded) {
            // Flash the ball by temporarily increasing its size
            pipelineObj.ball.scale.set(1.5, 1.5, 1.5);
            
            // Animate back to normal size
            setTimeout(() => {
              if (pipelineObj.ball) {
                pipelineObj.ball.scale.set(1, 1, 1);
              }
            }, 300);
            
            // Flag as needing animation
            this.animating = true;
          }
        }
      }
      
      // Create step markers along the pipeline
      const pipeline = this.pipelines.get(reconcileId);
      reconcileSteps.forEach((step, stepIndex) => {
        // Calculate position along the pipeline based on the total number of expected steps
        // This makes the markers spaced out more evenly
        const expectedSteps = Math.max(reconcileSteps.length, 11);
        const tPos = Math.min(1.0, stepIndex / (expectedSteps - 1 || 1));
        const markerPosition = pipeline.getPoint(tPos);
        
        // Add a more visible marker at each step position
        if (!this.stepObjects.has(step.id)) {
          const markerGeometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
          const markerMaterial = new THREE.MeshPhongMaterial({
            color: this.getColorForStatus(step.status),
            transparent: true,
            opacity: 0.9
          });
          const marker = new THREE.Mesh(markerGeometry, markerMaterial);
          marker.position.copy(markerPosition);
          
          this.flowGroup.add(marker);
          this.stepObjects.set(step.id, marker);
          
          // Add all step data directly to userData without nesting under 'data'
          // This ensures all fields are available for the tooltip and info display
          marker.userData = {
            type: 'step',
            ...step  // Spread all fields into userData directly
          };
          
          // Create a permanent info box for each step with all fields
          const infoLabel = this.createStepInfoTooltip(step, 
            { x: markerPosition.x + 1.5, y: markerPosition.y, z: markerPosition.z });
          this.flowGroup.add(infoLabel);
          marker.userData.infoLabel = infoLabel;
        }
      });
      
      pipelineIndex++;
    }
  }
  
  update(speed) {
    // If in manual control mode and no active animation, skip update
    if (this.manualControl && !this.animating) {
      return;
    }
    
    // Get delta time for smooth animations
    const delta = this.clock.getDelta() * speed;
    
    // Check if we need to animate
    const now = Date.now();
    if (!this.animating && now - this.lastUpdate > 2000 && this.isPlaying) {
      // Check if any balls need to move
      for (const [reconcileId, targetPos] of this.targetPositions.entries()) {
        const currentPos = this.ballPositions.get(reconcileId) || 0;
        if (Math.abs(currentPos - targetPos) > 0.01) {
          this.animating = true;
          break;
        }
      }
    }
    
    // Skip update if not animating
    if (!this.animating) return;
    
    // Flag to check if we should continue animating
    let stillAnimating = false;
    
    // Update ball positions along pipelines
    for (const [reconcileId, objects] of this.pipelineObjects.entries()) {
      if (!objects.ball) continue;
      
      const pipeline = this.pipelines.get(reconcileId);
      const currentPos = this.ballPositions.get(reconcileId) || 0;
      const targetPos = this.targetPositions.get(reconcileId) || 0;
      
      // Only update if position needs to change
      if (Math.abs(currentPos - targetPos) > 0.001) {
        // Speed up animation for faster feedback
        const animationSpeed = 1.2 * speed; 
        
        // Smoothly move ball toward target position
        let newPos = currentPos;
        if (currentPos < targetPos) {
          newPos = Math.min(targetPos, currentPos + delta * animationSpeed);
        } else if (currentPos > targetPos) {
          newPos = Math.max(targetPos, currentPos - delta * animationSpeed);
        }
        
        // Update ball position along curve
        const t = Math.min(1, Math.max(0, newPos));
        const position = pipeline.getPoint(t);
        objects.ball.position.copy(position);
        
        // Flash the ball briefly when it reaches a step position - only in auto mode
        if (this.isPlaying) {
          // Check if we're close to a step position
          const stepsForThisReconcile = this.steps.filter(s => 
            (s.reconcileId === reconcileId || s.reconcileID === reconcileId)
          );
          const expectedSteps = Math.max(stepsForThisReconcile.length, 11);
          
          for (let i = 0; i < expectedSteps; i++) {
            const stepPos = i / (expectedSteps - 1 || 1);
            // If we just crossed a step position
            if (Math.abs(t - stepPos) < 0.01 && Math.abs(currentPos - stepPos) >= 0.01) {
              // Flash the ball by temporarily increasing its size
              objects.ball.scale.set(1.5, 1.5, 1.5);
              
              // Animate back to normal size
              setTimeout(() => {
                if (objects.ball) {
                  objects.ball.scale.set(1, 1, 1);
                }
              }, 150);
              
              // Update the ball color to match the step status
              // Check against both reconcileId and reconcileID formats for the target ID
              const targetReconcileId = '275bf9f9-bb71-4430-9c30-2e99dfdc3b5d';
              if ((reconcileId === targetReconcileId) && i < stepsForThisReconcile.length) {
                const currentStep = stepsForThisReconcile[i];
                if (currentStep && currentStep.status) {
                  objects.ball.material.color.set(this.getColorForStatus(currentStep.status));
                }
              }
              
              break;
            }
          }
        }
        
        // Store new position
        this.ballPositions.set(reconcileId, newPos);
        
        // Check if we're still animating
        if (Math.abs(newPos - targetPos) > 0.01) {
          stillAnimating = true;
        } else if (this.manualControl) {
          // If we've reached the target position in manual mode, update current step index
          const steps = this.getStepsByReconcileId().get(reconcileId) || [];
          if (steps.length > 0) {
            const targetIndex = Math.round(targetPos * Math.max(steps.length - 1, 1));
            this.currentStepIndices.set(reconcileId, targetIndex);
          }
        }
      }
      
      // Make ball pulse
      const pulseAmount = (objects.ball.userData && objects.ball.userData.lastUpdated && 
                          now - objects.ball.userData.lastUpdated < 1000) ? 0.3 : 0.1;
      const scale = 1 + pulseAmount * Math.sin(Date.now() * 0.003 * speed);
      objects.ball.scale.set(scale, scale, scale);
    }
    
    this.animating = stillAnimating;
    this.lastUpdate = now;
  }
  
  // Create a tooltip for step info
  createStepInfoTooltip(step, position) {
    // Format the timestamp
    const timestamp = step.timestamp ? 
      (typeof step.timestamp === 'string' ? step.timestamp : new Date(step.timestamp).toLocaleTimeString()) 
      : (step.ts ? step.ts : '');
    
    // Find the step number out of total steps
    let titleText = 'Step Details';
    if (step.reconcileId || step.reconcileID) {
      const reconcileId = step.reconcileId || step.reconcileID;
      const stepsForThisId = this.steps.filter(s => (s.reconcileId || s.reconcileID) === reconcileId);
      const stepIndex = stepsForThisId.findIndex(s => s.id === step.id);
      if (stepIndex !== -1) {
        titleText = `Step ${stepIndex + 1} of ${stepsForThisId.length}`;
        if (reconcileId === '275bf9f9-bb71-4430-9c30-2e99dfdc3b5d') {
          titleText += ' (Target ID)';
        }
      }
    }
    
    // Create bullet point styled text for step details with all available fields
    let infoText = `${titleText}\n\n`;
    
    // Get all keys from the step object, excluding UI-specific properties
    const allKeys = Object.keys(step).filter(key => 
      !['label', 'infoLabel', 'rawData', '__proto__'].includes(key)
    );
    
    // Add fields in a sensible order
    const orderedFields = [
      // Basic info first
      'msg', 'message', 'description', 'level', 
      'stepType', 'type', 'controller', 'controllerGroup', 'controllerKind',
      // Resource info
      'namespace', 'name', 'resource',
      // Status
      'status',
      // IDs and timestamps
      'reconcileId', 'reconcileID', 'eventId', 'id', 'timestamp', 'ts',
      // Other fields at the end
      ...allKeys.filter(key => 
        !['stepType', 'type', 'controller', 'controllerGroup', 'controllerKind', 
          'namespace', 'name', 'resource', 'status', 'msg', 'message', 'description', 'level',
          'reconcileId', 'reconcileID', 'eventId', 'id', 'timestamp', 'ts', 'HostedCluster'].includes(key)
      )
    ];
    
    // Set of already added keys to avoid duplication
    const addedKeys = new Set();
    
    // Add all fields that exist in the step object
    for (const key of orderedFields) {
      if (step[key] !== undefined && step[key] !== null && key !== 'HostedCluster' && !addedKeys.has(key)) {
        // Handle special case for message fields to avoid duplication
        if ((key === 'message' && step.msg) || 
            (key === 'description' && (step.msg || step.message)) ||
            (key === 'reconcileID' && step.reconcileId) ||
            (key === 'ts' && step.timestamp)) {
          continue; // Skip if we already have a higher priority message field
        }
        
        // Format the value
        let value = step[key];
        if (typeof value === 'object' && value !== null) {
          // For objects, show a simplified representation
          value = `{...}`;
        } else if (typeof value === 'string' && value.length > 80 && 
                  ['msg', 'message', 'description'].includes(key)) {
          // Truncate long messages
          value = value.substring(0, 80) + '...';
        }
        
        // Add the field to the info text
        const displayKey = key.charAt(0).toUpperCase() + key.slice(1);
        infoText += `• ${displayKey}: ${value}\n`;
        
        // Mark key as added
        addedKeys.add(key);
      }
    }
    
    // Add HostedCluster info if available (special handling for nested object)
    if (step.HostedCluster && typeof step.HostedCluster === 'object') {
      const hostedCluster = step.HostedCluster;
      
      // Display HostedCluster as header
      infoText += `• HostedCluster:\n`;
      
      // Add nested properties with indentation
      Object.entries(hostedCluster).forEach(([key, value]) => {
        const displayKey = key.charAt(0).toUpperCase() + key.slice(1);
        infoText += `  - ${displayKey}: ${value}\n`;
      });
    }
    
    // Create a label with the info text
    const label = createTextLabel(infoText, position, 0.45);
    
    // Add a background panel for better readability
    const textBounds = new THREE.Box3().setFromObject(label);
    const width = textBounds.max.x - textBounds.min.x + 0.6;
    const height = textBounds.max.y - textBounds.min.y + 0.6;
    
    const bgGeometry = new THREE.PlaneGeometry(width, height);
    const bgMaterial = new THREE.MeshBasicMaterial({
      color: 0x0a192f,
      transparent: true,
      opacity: 0.95,
    });
    
    const background = new THREE.Mesh(bgGeometry, bgMaterial);
    background.position.set(
      position.x + width/2 - 0.3,
      position.y - height/2 + 0.3,
      position.z - 0.01
    );
    
    // Create a group and add both the background and text
    const group = new THREE.Group();
    group.add(background);
    group.add(label);
    
    return group;
  }
  
  // Get color based on status
  getColorForStatus(status) {
    switch (status) {
      case 'started':
      case 'reconcile-start':
        return 0xffd166;
      case 'completed':
      case 'reconcile-complete':
        return 0x06d6a0;
      case 'failed':
      case 'reconcile-error':
        return 0xef476f;
      default:
        return 0xcccccc;
    }
  }
}

export default ReconcileFlow; 