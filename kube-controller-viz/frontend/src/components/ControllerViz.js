import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import EventQueue from './EventQueue';
import ReconcileFlow from './ReconcileFlow';
import { createTextLabel } from '../utils/three-utils';

const ControllerViz = ({ controllerState, isPlaying, speed }) => {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const eventQueueRef = useRef(null);
  const reconcileFlowRef = useRef(null);
  const [hoveredObject, setHoveredObject] = useState(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [navigationMode, setNavigationMode] = useState('auto');

  // Initialize Three.js scene
  useEffect(() => {
    if (!mountRef.current) return;

    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    sceneRef.current = scene;

    // Create camera
    const camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.z = 25;
    camera.position.y = 5;
    camera.position.x = 0;
    cameraRef.current = camera;

    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Add orbit controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;
    controlsRef.current = controls;

    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    // Add directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 10);
    scene.add(directionalLight);

    // Add grid helper
    const gridHelper = new THREE.GridHelper(40, 40, 0x444444, 0x222222);
    scene.add(gridHelper);

    // Add controller components
    const eventQueue = new EventQueue(scene);
    eventQueueRef.current = eventQueue;

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

    // Handle mouse move for tooltips
    const handleMouseMove = (event) => {
      setMousePosition({
        x: event.clientX,
        y: event.clientY
      });

      // Raycasting for hover effects
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2(
        (event.clientX / window.innerWidth) * 2 - 1,
        -(event.clientY / window.innerHeight) * 2 + 1
      );

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);

      if (intersects.length > 0) {
        const object = intersects[0].object;
        if (object.userData && object.userData.type === 'event') {
          setHoveredObject({
            type: 'event',
            data: object.userData.data || object.userData
          });
          return;
        } else if (object.userData && object.userData.type === 'step') {
          setHoveredObject({
            type: 'step',
            data: object.userData
          });
          return;
        }
      }

      setHoveredObject(null);
    };
    window.addEventListener('mousemove', handleMouseMove);

    // Listen for keyboard events to update navigation mode
    const handleKeyDown = (event) => {
      if (event.key === ' ') { // Space key
        setNavigationMode(prev => prev === 'auto' ? 'manual' : 'auto');
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      
      if (controlsRef.current) {
        controlsRef.current.update();
      }
      
      if (eventQueueRef.current && isPlaying) {
        eventQueueRef.current.update(speed);
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
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('keydown', handleKeyDown);
      mountRef.current.removeChild(renderer.domElement);
    };
  }, []);

  // Update visualization when controller state changes
  useEffect(() => {
    if (!controllerState || !eventQueueRef.current || !reconcileFlowRef.current) return;

    eventQueueRef.current.updateEvents(controllerState.events);
    reconcileFlowRef.current.updateSteps(controllerState.recentSteps);
  }, [controllerState]);

  // Create tooltip content
  const createTooltipContent = (obj) => {
    if (!obj) return '';
    
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
        
        {/* Display any specific step info for our target reconcileID */}
        {obj.reconcileId === '275bf9f9-bb71-4430-9c30-2e99dfdc3b5d' && (
          <div style={{marginTop: '10px', borderTop: '1px solid #00b4d8', paddingTop: '5px'}}>
            <strong>Target Reconcile ID Match!</strong>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
      
      {/* Navigation controls help panel */}
      <div className="controls-panel">
        <h3>Navigation Controls</h3>
        <div className="mode-indicator">
          <span>Mode: </span>
          <span className={`mode ${navigationMode}`}>{navigationMode === 'auto' ? 'Auto' : 'Manual'}</span>
        </div>
        <div className="controls-list">
          <div className="control-item">
            <kbd>Space</kbd>
            <span>Toggle auto/manual mode</span>
          </div>
          <div className={`control-item ${navigationMode === 'manual' ? 'active' : 'disabled'}`}>
            <kbd>←</kbd>
            <span>Previous step</span>
          </div>
          <div className={`control-item ${navigationMode === 'manual' ? 'active' : 'disabled'}`}>
            <kbd>→</kbd>
            <span>Next step</span>
          </div>
        </div>
      </div>
      
      {hoveredObject && (
        <div 
          className="event-tooltip"
          style={{
            left: mousePosition.x + 15,
            top: mousePosition.y + 15
          }}
        >
          {hoveredObject.type === 'event' && (
            <>
              <h3>Event Details</h3>
              <div>{createTooltipContent(hoveredObject.data)}</div>
            </>
          )}
          
          {hoveredObject.type === 'step' && (
            <>
              <h3>Step Details</h3>
              <div>{createTooltipContent(hoveredObject.data)}</div>
            </>
          )}
        </div>
      )}
    </>
  );
};

export default ControllerViz; 