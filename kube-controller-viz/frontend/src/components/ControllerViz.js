import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import ReconcileFlow from './ReconcileFlow';
import { createTextLabel } from '../utils/three-utils';

const ControllerViz = ({ controllerState, isPlaying, speed }) => {
  const containerRef = useRef();
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const reconcileFlowRef = useRef(null);
  const frameIdRef = useRef(null);
  const [hoveredObject, setHoveredObject] = useState(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [navigationMode, setNavigationMode] = useState('auto');
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [panelPosition, setPanelPosition] = useState({ left: '1.5rem', bottom: '1.5rem' });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0 });
  const [panelSize, setPanelSize] = useState({ width: 550, height: 'auto' });
  const panelRef = useRef(null);
  const prevStepRef = useRef(null);
  const [activePipelineId, setActivePipelineId] = useState(null);
  const [groupingMode, setGroupingMode] = useState('reconcileId');

  // Handle mouse movements for tooltips, dragging and resizing
  const handleMouseMove = (event) => {
    // Update mouse position for general hover
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    setMousePosition({ x, y });

    // Handle dragging the panel
    if (isDragging && panelRef.current) {
      const deltaX = event.clientX - dragStart.x;
      const deltaY = event.clientY - dragStart.y;
      
      // Get current position
      let currentLeft = panelRef.current.offsetLeft;
      
      // For bottom positioning, we need to invert the deltaY
      // Calculate bottom from viewport height and panel position
      const viewportHeight = containerRef.current.clientHeight;
      const panelHeight = panelRef.current.offsetHeight;
      const currentBottom = viewportHeight - (panelRef.current.offsetTop + panelHeight);
      
      // Apply the delta to the current position
      const newLeft = `${currentLeft + deltaX}px`;
      // For bottom position, we move in the opposite direction of drag
      const newBottom = `${currentBottom + deltaY}px`;
      
      setPanelPosition({
        left: newLeft,
        bottom: newBottom
      });
      
      setDragStart({ x: event.clientX, y: event.clientY });
    }

    // Handle resizing the panel
    if (isResizing && panelRef.current) {
      const deltaX = event.clientX - resizeStart.x;
      const deltaY = event.clientY - resizeStart.y;
      
      setPanelSize({
        width: Math.max(300, panelSize.width + deltaX),
        height: panelSize.height === 'auto' 
          ? panelRef.current.offsetHeight + deltaY 
          : Math.max(200, panelSize.height + deltaY)
      });
      
      setResizeStart({ x: event.clientX, y: event.clientY });
    }

    // Raycasting for hover effects
    if (sceneRef.current && cameraRef.current) {
      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      
      pointer.x = (x / rect.width) * 2 - 1;
      pointer.y = -(y / rect.height) * 2 + 1;
      
      raycaster.setFromCamera(pointer, cameraRef.current);
      
      const intersects = raycaster.intersectObjects(sceneRef.current.children, true);
      
      if (intersects.length > 0) {
        // Look for objects with userData, prioritizing reconcileId boxes
        for (let i = 0; i < intersects.length; i++) {
          const object = intersects[i].object;
          
          // Check for a reconcileId box first
          if (object.userData && object.userData.reconcileId && object.userData.isReconcileIdBox) {
            setHoveredObject({
              reconcileId: object.userData.reconcileId,
              description: 'Click to select this pipeline',
              isReconcileIdBox: true
            });
            return;
          }
          
          // Check for a step in the userData
          if (object.userData && object.userData.step) {
            setHoveredObject(object.userData.step);
            return;
          }
          
          // Check for a pipeline (tube) in the userData
          if (object.userData && object.userData.reconcileId) {
            // Show hover tooltip with the reconcileId
            setHoveredObject({
              reconcileId: object.userData.reconcileId,
              description: 'Click to select this pipeline'
            });
            return;
          }
        }
      }
      
      setHoveredObject(null);
    }
  };

  // Handle mouse clicks on the pipeline
  const handleClick = (event) => {
    // Skip if dragging or resizing
    if (isDragging || isResizing) return;
    
    if (sceneRef.current && cameraRef.current) {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      
      const raycaster = new THREE.Raycaster();
      // Set a larger threshold to make it easier to click on thin tubes
      raycaster.params.Line.threshold = 0.5;
      raycaster.params.Points.threshold = 0.5;
      
      const pointer = new THREE.Vector2();
      
      // Calculate normalized device coordinates properly
      pointer.x = (x / rect.width) * 2 - 1;
      pointer.y = -(y / rect.height) * 2 + 1;
      
      raycaster.setFromCamera(pointer, cameraRef.current);
      
      // Use a recursive search to find all objects including nested ones
      const intersects = raycaster.intersectObjects(sceneRef.current.children, true);
      
      if (intersects.length > 0) {
        console.log("Click detected, intersected objects:", intersects.length);
        
        // Debug: log all intersected objects
        for (let i = 0; i < Math.min(5, intersects.length); i++) {
          const obj = intersects[i].object;
          console.log(`Intersected object ${i}:`, obj.type, obj.userData);
        }
        
        // Find objects with reconcileId in userData, prioritizing reconcileId boxes
        let reconcileIdBoxObject = null;
        let markerObject = null;
        let tubeObject = null;
        
        // First pass - categorize objects
        for (let i = 0; i < intersects.length; i++) {
          const obj = intersects[i].object;
          if (obj.userData && obj.userData.reconcileId) {
            if (obj.userData.isReconcileIdBox) {
              reconcileIdBoxObject = obj;
              break; // Highest priority - stop searching if found
            } else if (obj.userData.step) {
              markerObject = obj;
            } else {
              tubeObject = obj;
            }
          }
        }
        
        // Determine which object to use (in priority order)
        let targetObject = reconcileIdBoxObject || markerObject || tubeObject;
        
        // Handle pipeline selection if we found an object with reconcileId
        if (targetObject && targetObject.userData.reconcileId) {
          const newPipelineId = targetObject.userData.reconcileId;
          console.log("Selecting pipeline:", newPipelineId, 
            targetObject.userData.isReconcileIdBox ? "(from ReconcileID box)" : 
            targetObject.userData.step ? "(from step marker)" : "(from tube)");
          
          // Set this pipeline as active in the ReconcileFlow
          if (reconcileFlowRef.current) {
            const success = reconcileFlowRef.current.setActivePipeline(newPipelineId);
            if (success) {
              setActivePipelineId(newPipelineId);
              
              // If we're in manual mode, this will update the current step
              if (navigationMode === 'manual') {
                // Force a re-render when changing pipelines
                setPanelSize(prev => ({ ...prev }));
              }
              
              console.log(`Successfully set active pipeline to ${newPipelineId}`);
            } else {
              console.warn(`Failed to set active pipeline to ${newPipelineId}`);
            }
          }
        }
      }
    }
  };

  // Define handleKeyDown function at component level before any useEffect uses it
  const handleKeyDown = (event) => {
    // Skip if focus is on an input field
    if (document.activeElement && 
        (document.activeElement.tagName === 'INPUT' || 
         document.activeElement.tagName === 'TEXTAREA' || 
         document.activeElement.tagName === 'SELECT')) {
      return;
    }
    
    console.log(`Key pressed: ${event.code}`);
    
    // Skip if reconcileFlow not initialized
    if (!reconcileFlowRef.current) {
      console.warn("reconcileFlowRef is not initialized yet");
      return;
    }
    
    switch (event.code) {
      case 'Space':
        console.log("Space pressed - toggling navigation mode");
        event.preventDefault(); // Prevent default space behavior (scrolling)
        
        // Toggle between auto and manual modes
        const newMode = navigationMode === 'auto' ? 'manual' : 'auto';
        console.log(`Changing navigation mode from ${navigationMode} to ${newMode}`);
        setNavigationMode(newMode);
        
        // Update reconcileFlow properties
        reconcileFlowRef.current.manualControl = newMode === 'manual';
        reconcileFlowRef.current.isPlaying = newMode === 'auto';
        
        if (newMode === 'manual') {
          console.log("Initializing manual navigation mode");
          reconcileFlowRef.current.initializeManualNavigation();
          
          // Update active pipeline ID in state if available
          if (reconcileFlowRef.current.activePipelineId) {
            console.log(`Setting active pipeline ID to: ${reconcileFlowRef.current.activePipelineId}`);
            setActivePipelineId(reconcileFlowRef.current.activePipelineId);
          }
        }
        
        // Force re-render by updating panel size state
        setPanelSize(prev => ({ ...prev }));
        break;
        
      case 'KeyG':
        console.log("G pressed - toggling grouping mode");
        // Toggle between reconcileId and resource grouping modes
        const newGroupingMode = groupingMode === 'reconcileId' ? 'resource' : 'reconcileId';
        console.log(`Changing grouping mode from ${groupingMode} to ${newGroupingMode}`);
        setGroupingMode(newGroupingMode);
        
        // Update reconcileFlow grouping mode
        if (reconcileFlowRef.current) {
          reconcileFlowRef.current.setGroupingMode(newGroupingMode);
          
          // Update active pipeline ID in state if it changed
          if (reconcileFlowRef.current.activePipelineId !== activePipelineId) {
            setActivePipelineId(reconcileFlowRef.current.activePipelineId);
          }
          
          // Force re-render
          setPanelSize(prev => ({ ...prev }));
        }
        break;
        
      case 'ArrowRight':
        console.log(`ArrowRight pressed - navigationMode: ${navigationMode}`);
        if (navigationMode === 'manual') {
          event.preventDefault(); // Prevent default arrow key behavior
          console.log("Moving to next step");
          
          // Call moveToNextStep on reconcileFlow
          try {
            reconcileFlowRef.current.moveToNextStep();
            
            // Update active pipeline in state if changed
            if (reconcileFlowRef.current.activePipelineId !== activePipelineId) {
              console.log(`Updating active pipeline ID from ${activePipelineId} to ${reconcileFlowRef.current.activePipelineId}`);
              setActivePipelineId(reconcileFlowRef.current.activePipelineId);
            }
            
            // Force re-render
            setPanelSize(prev => ({ ...prev }));
          } catch (error) {
            console.error("Error moving to next step:", error);
          }
        }
        break;
        
      case 'ArrowLeft':
        console.log(`ArrowLeft pressed - navigationMode: ${navigationMode}`);
        if (navigationMode === 'manual') {
          event.preventDefault(); // Prevent default arrow key behavior
          console.log("Moving to previous step");
          
          // Call moveToPreviousStep on reconcileFlow
          try {
            reconcileFlowRef.current.moveToPreviousStep();
            
            // Update active pipeline in state if changed
            if (reconcileFlowRef.current.activePipelineId !== activePipelineId) {
              console.log(`Updating active pipeline ID from ${activePipelineId} to ${reconcileFlowRef.current.activePipelineId}`);
              setActivePipelineId(reconcileFlowRef.current.activePipelineId);
            }
            
            // Force re-render
            setPanelSize(prev => ({ ...prev }));
          } catch (error) {
            console.error("Error moving to previous step:", error);
          }
        }
        break;
        
      default:
        // Ignore other keys
        break;
    }
  };
  
  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    sceneRef.current = scene;

    // Create camera
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.z = 15;
    camera.position.y = 5;
    camera.position.x = 0;
    cameraRef.current = camera;

    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Add orbit controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;

    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    // Add directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 10);
    scene.add(directionalLight);

    // Add grid helper
    const gridHelper = new THREE.GridHelper(40, 40, 0x444444, 0x222222);
    scene.add(gridHelper);

    // Add reconciliation flow
    const reconcileFlow = new ReconcileFlow(scene);
    reconcileFlowRef.current = reconcileFlow;

    // Handle window resize
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', handleResize);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      
      if (controls) {
        controls.update();
      }
      
      if (reconcileFlowRef.current && isPlaying) {
        reconcileFlowRef.current.update(speed);
      }
      
      renderer.render(scene, camera);
    };
    animate();

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      
      if (containerRef.current && rendererRef.current) {
        try {
          containerRef.current.removeChild(rendererRef.current.domElement);
        } catch (error) {
          console.warn("Error removing renderer DOM element:", error);
        }
      }
    };
  }, []);
  
  // Setup event listener in useEffect
  useEffect(() => {
    console.log("Setting up keyboard event listener");
    
    // Add event listener for keyboard controls
    window.addEventListener('keydown', handleKeyDown);
    
    // Cleanup: remove event listener when component unmounts
    return () => {
      console.log("Removing keyboard event listener");
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [navigationMode, activePipelineId]); // Re-add when these dependencies change

  // Update visualization when controller state changes
  useEffect(() => {
    if (!controllerState || !reconcileFlowRef.current) return;
    reconcileFlowRef.current.updateSteps(controllerState.recentSteps);
    
    // Set the initial activePipelineId if we haven't already
    if (!activePipelineId && reconcileFlowRef.current.activePipelineId) {
      setActivePipelineId(reconcileFlowRef.current.activePipelineId);
    }
  }, [controllerState, activePipelineId]);
  
  // Optimize step details refresh
  useEffect(() => {
    if (!reconcileFlowRef.current) return;
    
    const checkForStepChanges = () => {
      const currentStep = reconcileFlowRef.current.getCurrentStep();
      if (currentStep && (!prevStepRef.current || prevStepRef.current.id !== currentStep.id)) {
        prevStepRef.current = currentStep;
        // Force a re-render when the step changes
        setPanelSize(prev => ({ ...prev }));
      }
      
      // Update our local state if activePipelineId changes in the ReconcileFlow
      if (reconcileFlowRef.current.activePipelineId !== activePipelineId) {
        setActivePipelineId(reconcileFlowRef.current.activePipelineId);
      }
    };
    
    const interval = setInterval(checkForStepChanges, 100);
    return () => clearInterval(interval);
  }, [activePipelineId]);

  // Update grouping mode when it changes
  useEffect(() => {
    if (!reconcileFlowRef.current) return;
    reconcileFlowRef.current.setGroupingMode(groupingMode);
  }, [groupingMode]);

  // Create tooltip content
  const createTooltipContent = (obj) => {
    if (!obj) return '';
    
    // Special tooltip for pipeline/tube selection
    if (obj.reconcileId && obj.description === 'Click to select this pipeline') {
      return (
        <div style={{ padding: '8px', fontFamily: 'monospace' }}>
          <strong>Pipeline: {obj.reconcileId}</strong><br/>
          <div>Click to control this pipeline</div>
        </div>
      );
    }
    
    // Format the data into bullet points
    return (
      <div style={{ padding: '8px', fontFamily: 'monospace' }}>
        <strong>Complete Details</strong><br/><br/>
        
        {/* Display all available fields */}
        {obj.type && <div>• <strong>Type:</strong> {obj.type}</div>}
        {obj.stepType && <div>• <strong>StepType:</strong> {obj.stepType}</div>}
        {obj.controller && <div>• <strong>Controller:</strong> {obj.controller}</div>}
        {obj.controllerGroup && <div>• <strong>ControllerGroup:</strong> {obj.controllerGroup}</div>}
        {obj.controllerKind && <div>• <strong>ControllerKind:</strong> {obj.controllerKind}</div>}
        
        {/* Resource information */}
        {obj.namespace && obj.name && (
          <div>• <strong>Resource:</strong> {obj.namespace}/{obj.name}</div>
        )}
        
        {/* Status */}
        {obj.status && <div>• <strong>Status:</strong> {obj.status}</div>}
        
        {/* Message or description */}
        {obj.msg && (
          <div>• <strong>Message:</strong> {obj.msg}</div>
        )}
        {obj.message && !obj.msg && (
          <div>• <strong>Message:</strong> {obj.message}</div>
        )}
        {obj.description && !obj.message && !obj.msg && (
          <div>• <strong>Description:</strong> {obj.description}</div>
        )}
        
        {/* Level from log entry */}
        {obj.level && (
          <div>• <strong>Level:</strong> {obj.level}</div>
        )}
        
        {/* ReconcileID */}
        {obj.reconcileId && (
          <div>• <strong>ReconcileID:</strong> {obj.reconcileId}</div>
        )}
        
        {/* Timestamp */}
        {obj.timestamp && (
          <div>• <strong>Time:</strong> {
            typeof obj.timestamp === 'string' 
              ? obj.timestamp 
              : new Date(obj.timestamp).toLocaleTimeString()
          }</div>
        )}
        
        {/* HostedCluster information */}
        {obj.HostedCluster && typeof obj.HostedCluster === 'object' && (
          <div>• <strong>HostedCluster:</strong> {obj.HostedCluster.namespace || ''}/{obj.HostedCluster.name || ''}</div>
        )}
        
        {/* EventID */}
        {obj.eventId && <div>• <strong>EventID:</strong> {obj.eventId}</div>}
        
        {/* Step count if available */}
        {obj.steps > 0 && (
          <div>• <strong>Steps:</strong> {obj.steps}</div>
        )}
        
        {/* Step ID */}
        {obj.id && (
          <div>• <strong>Step ID:</strong> {obj.id}</div>
        )}
        
        {/* Add indicator if this step is from the active pipeline */}
        {obj.reconcileId === activePipelineId && (
          <div style={{marginTop: '10px', borderTop: '1px solid #00b4d8', paddingTop: '5px'}}>
            <strong>Active Pipeline</strong>
          </div>
        )}
      </div>
    );
  };

  const handlePanelMouseDown = (e) => {
    // Only handle mousedown on the panel header, not its content
    if (e.target.closest('.step-details-header')) {
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      e.preventDefault();
    }
  };

  const handleResizeMouseDown = (e) => {
    setIsResizing(true);
    setResizeStart({ x: e.clientX, y: e.clientY });
    e.preventDefault();
    e.stopPropagation();
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setIsResizing(false);
  };

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [navigationMode, isDragging, isResizing, dragStart, resizeStart, panelPosition, panelSize]);

  return (
    <div
      ref={containerRef}
      className="visualization-container"
      onMouseMove={handleMouseMove}
      onClick={handleClick}
    >
      {hoveredObject && (
        <div
          className="event-tooltip"
          style={{
            position: 'absolute',
            left: `${mousePosition.x + 10}px`,
            top: `${mousePosition.y + 10}px`,
          }}
        >
          {createTooltipContent(hoveredObject)}
        </div>
      )}

      <div className="controls-panel">
        <h3>Navigation Controls</h3>
        <div className="mode-indicator">
          <span>Mode:</span>
          <div className={`mode ${navigationMode}`}>
            {navigationMode === 'auto' ? 'Auto' : 'Manual'}
          </div>
        </div>
        <div className="mode-indicator">
          <span>Grouping:</span>
          <div className={`mode ${groupingMode === 'reconcileId' ? 'auto' : 'manual'}`}>
            {groupingMode === 'reconcileId' ? 'ReconcileID' : 'Resource'}
          </div>
        </div>
        <ul className="controls-list">
          <li className="control-item">
            <kbd>Space</kbd>
            <span>Toggle Manual/Auto</span>
          </li>
          <li className="control-item">
            <kbd>G</kbd>
            <span>Toggle Grouping Mode</span>
          </li>
          <li className={`control-item ${navigationMode === 'manual' ? 'active' : 'disabled'}`}>
            <kbd>←</kbd>
            <span>Previous Step</span>
          </li>
          <li className={`control-item ${navigationMode === 'manual' ? 'active' : 'disabled'}`}>
            <kbd>→</kbd>
            <span>Next Step</span>
          </li>
          <li className="control-item">
            <kbd>Click</kbd>
            <span>Select Pipeline</span>
          </li>
        </ul>
        
        {activePipelineId && (
          <div className="active-pipeline">
            <span className="active-pipeline-label">Active Pipeline:</span>
            <span className="active-pipeline-id">
              {activePipelineId.length > 20 
                ? `${activePipelineId.substring(0, 20)}...`
                : activePipelineId}
            </span>
          </div>
        )}
      </div>

      {reconcileFlowRef.current && reconcileFlowRef.current.getCurrentStep() && (
        <div
          ref={panelRef}
          className={`step-details-panel ${isDragging ? 'dragging' : ''}`}
          style={{
            ...panelPosition,
            width: `${panelSize.width}px`,
            height: panelSize.height
          }}
          onMouseDown={handlePanelMouseDown}
        >
          <div className="step-details-header">
            <div className="drag-handle">
              <div></div>
              <div></div>
              <div></div>
            </div>
            <h3>
              Step Details 
              <span className="grouping-mode">
                {groupingMode === 'reconcileId' ? 'Grouping by ReconcileID' : 'Grouping by Resource'}
              </span>
            </h3>
            <div className="panel-controls">
              <div className="resize-handle" onMouseDown={handleResizeMouseDown}></div>
            </div>
          </div>
          <div className="step-details-content">
            <div className="step-header">
              <div className="step-number">
                Step {reconcileFlowRef.current.getCurrentStep().metadata?.stepNumber} of {reconcileFlowRef.current.getCurrentStep().metadata?.totalSteps}
              </div>
              <div 
                className={`status-badge ${reconcileFlowRef.current.getCurrentStep().status.toLowerCase()}`}
              >
                {reconcileFlowRef.current.getCurrentStep().status}
              </div>
            </div>
            <div className="step-id">
              ReconcileID: {reconcileFlowRef.current.getCurrentStep().reconcileId?.substring(0, 8)}...
            </div>

            {reconcileFlowRef.current.getCurrentStep().description && (
              <div className="step-message">
                {reconcileFlowRef.current.getCurrentStep().description}
              </div>
            )}

            <div className="all-fields-container">
              <div className="fields-section">
                <h4>Core Information</h4>
                <div className="step-fields">
                  {/* Resource Information */}
                  <div className="step-field">
                    <div className="field-name">Resource:</div>
                    <div className="field-value">
                      {reconcileFlowRef.current.getCurrentStep().namespace && reconcileFlowRef.current.getCurrentStep().name ? 
                        `${reconcileFlowRef.current.getCurrentStep().namespace}/${reconcileFlowRef.current.getCurrentStep().name}` : 
                        'Not available'}
                    </div>
                  </div>
                  
                  {/* Controller */}
                  <div className="step-field">
                    <div className="field-name">Controller:</div>
                    <div className="field-value">
                      {reconcileFlowRef.current.getCurrentStep().controller || 'Not available'}
                    </div>
                  </div>
                  
                  {/* Controller Group */}
                  <div className="step-field">
                    <div className="field-name">Controller Group:</div>
                    <div className="field-value">
                      {reconcileFlowRef.current.getCurrentStep().controllerGroup || 'Not available'}
                    </div>
                  </div>
                  
                  {/* Controller Kind */}
                  <div className="step-field">
                    <div className="field-name">Controller Kind:</div>
                    <div className="field-value">
                      {reconcileFlowRef.current.getCurrentStep().controllerKind || 'Not available'}
                    </div>
                  </div>
                  
                  {/* Timestamp */}
                  <div className="step-field">
                    <div className="field-name">Timestamp:</div>
                    <div className="field-value monospace">
                      {typeof reconcileFlowRef.current.getCurrentStep().timestamp === 'string' 
                        ? reconcileFlowRef.current.getCurrentStep().timestamp 
                        : new Date(reconcileFlowRef.current.getCurrentStep().timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="fields-section">
                <h4>Identifiers</h4>
                <div className="step-fields">
                  {/* ReconcileID */}
                  <div className="step-field">
                    <div className="field-name">ReconcileID:</div>
                    <div className="field-value monospace">
                      {reconcileFlowRef.current.getCurrentStep().reconcileId}
                    </div>
                  </div>
                  
                  {/* Step ID */}
                  <div className="step-field">
                    <div className="field-name">Step ID:</div>
                    <div className="field-value monospace">
                      {reconcileFlowRef.current.getCurrentStep().id}
                    </div>
                  </div>
                  
                  {/* Event ID if available */}
                  {reconcileFlowRef.current.getCurrentStep().eventId && (
                    <div className="step-field">
                      <div className="field-name">Event ID:</div>
                      <div className="field-value monospace">
                        {reconcileFlowRef.current.getCurrentStep().eventId}
                      </div>
                    </div>
                  )}
                  
                  {/* Step Type if available */}
                  {reconcileFlowRef.current.getCurrentStep().stepType && (
                    <div className="step-field">
                      <div className="field-name">Step Type:</div>
                      <div className="field-value">
                        {reconcileFlowRef.current.getCurrentStep().stepType}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* HostedCluster Information if available */}
              {reconcileFlowRef.current.getCurrentStep().HostedCluster && (
                <div className="fields-section">
                  <h4>HostedCluster Info</h4>
                  <div className="step-fields">
                    <div className="step-field">
                      <div className="field-name">Name:</div>
                      <div className="field-value">
                        {reconcileFlowRef.current.getCurrentStep().HostedCluster.name}
                      </div>
                    </div>
                    <div className="step-field">
                      <div className="field-name">Namespace:</div>
                      <div className="field-value">
                        {reconcileFlowRef.current.getCurrentStep().HostedCluster.namespace}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="fields-section">
                <h4>Additional Fields</h4>
                <div className="step-fields">
                  {Object.entries(reconcileFlowRef.current.getCurrentStep())
                    .filter(([key]) => !['id', 'eventId', 'stepType', 'description', 'timestamp', 'duration', 
                      'status', 'reconcileId', 'namespace', 'name', 'controller', 'metadata',
                      'controllerGroup', 'controllerKind', 'HostedCluster'].includes(key))
                    .map(([key, value]) => (
                      <div className="step-field" key={key}>
                        <div className="field-name">{key}:</div>
                        <div className="field-value">
                          {typeof value === 'object' ? JSON.stringify(value) : value.toString()}
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
            </div>
          </div>
          <div 
            className="resize-handle"
            onMouseDown={handleResizeMouseDown}
            title="Drag to resize"
          />
        </div>
      )}
    </div>
  );
};

export default ControllerViz; 