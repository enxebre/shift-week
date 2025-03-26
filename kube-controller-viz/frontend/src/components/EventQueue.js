import * as THREE from 'three';
import { createTextLabel } from '../utils/three-utils';

class EventQueue {
  constructor(scene) {
    this.scene = scene;
    this.events = [];
    this.eventObjects = new Map();
    this.queueGroup = new THREE.Group();
    this.queueGroup.position.set(-15, 5, 0);
    this.scene.add(this.queueGroup);
    
    // Add queue label
    const queueLabel = createTextLabel('Event Queue', { x: 0, y: 2, z: 0 }, 1.2);
    this.queueGroup.add(queueLabel);
    
    // Add queue container - make it look like a queue channel
    const queueGeometry = new THREE.BoxGeometry(8, 12, 2); 
    const queueMaterial = new THREE.MeshPhongMaterial({ 
      color: 0x0f3460,
      transparent: true,
      opacity: 0.5,
      wireframe: false
    });
    this.queueContainer = new THREE.Mesh(queueGeometry, queueMaterial);
    this.queueGroup.add(this.queueContainer);
    
    // Store reconcileId colors for consistency
    this.reconcileColors = new Map();
    this.nextColorIndex = 0;
    this.colorPalette = [
      0x3a86ff, 0xfb5607, 0x8338ec, 0xff006e, 0xffbe0b,
      0x00b4d8, 0xffd166, 0x06d6a0, 0xef476f, 0x9a8c98
    ];
  }
  
  // Get a consistent color for a reconcileId
  getColorForReconcileId(reconcileId) {
    if (!this.reconcileColors.has(reconcileId)) {
      const colorIndex = this.nextColorIndex % this.colorPalette.length;
      this.reconcileColors.set(reconcileId, this.colorPalette[colorIndex]);
      this.nextColorIndex++;
    }
    return this.reconcileColors.get(reconcileId);
  }
  
  updateEvents(events) {
    // Remove old events that are no longer in the list
    const currentEventIds = new Set(events.map(e => e.id));
    for (const [id, obj] of this.eventObjects.entries()) {
      if (!currentEventIds.has(id)) {
        if (obj.ball) this.queueGroup.remove(obj.ball);
        if (obj.label) this.queueGroup.remove(obj.label);
        if (obj.info) this.queueGroup.remove(obj.info);
        this.eventObjects.delete(id);
      }
    }
    
    // Group events by reconcileId to show them in context
    const eventsByReconcileId = new Map();
    events.forEach(event => {
      if (!eventsByReconcileId.has(event.reconcileId)) {
        eventsByReconcileId.set(event.reconcileId, []);
      }
      eventsByReconcileId.get(event.reconcileId).push(event);
    });
    
    // Sort events by timestamp within each reconcileId
    for (const [reconcileId, reconcileEvents] of eventsByReconcileId.entries()) {
      reconcileEvents.sort((a, b) => a.timestamp - b.timestamp);
    }
    
    // Calculate total rows needed
    let totalIndex = 0;
    
    // Update or add new events
    for (const [reconcileId, reconcileEvents] of eventsByReconcileId.entries()) {
      const reconcileColor = this.getColorForReconcileId(reconcileId);
      
      // Create a group label for the reconcileId
      const shortReconcileId = reconcileId.substring(0, 8);
      
      // Update or create group label
      const groupLabelId = `group-${reconcileId}`;
      if (!this.eventObjects.has(groupLabelId)) {
        const groupLabel = createTextLabel(shortReconcileId, {
          x: -2.5,
          y: 4 - (totalIndex * 0.8),
          z: 0.5
        }, 0.4);
        this.queueGroup.add(groupLabel);
        this.eventObjects.set(groupLabelId, { label: groupLabel });
      } else {
        const groupLabelObj = this.eventObjects.get(groupLabelId);
        groupLabelObj.label.position.y = 4 - (totalIndex * 0.8);
      }
      
      // Add balls for each event in this reconcileId group
      reconcileEvents.forEach((event, eventIndex) => {
        const verticalPos = 4 - (totalIndex * 0.8) - ((eventIndex + 1) * 0.6);
        
        if (this.eventObjects.has(event.id)) {
          // Update existing event
          const eventObj = this.eventObjects.get(event.id);
          if (eventObj.ball) {
            eventObj.ball.position.y = verticalPos;
            
            // Update color based on status
            let statusColor;
            switch (event.status) {
              case 'queued':
                statusColor = 0x00b4d8;
                break;
              case 'processing':
              case 'reconcile-start':
                statusColor = 0xffd166;
                break;
              case 'completed':
              case 'reconcile-complete':
                statusColor = 0x06d6a0;
                break;
              case 'failed':
              case 'reconcile-error':
                statusColor = 0xef476f;
                break;
              default:
                statusColor = 0xcccccc;
            }
            
            // Blend status color with reconcile color
            const blendedColor = new THREE.Color(statusColor).lerp(new THREE.Color(reconcileColor), 0.65);
            eventObj.ball.material.color = blendedColor;
          }
          
          // Update info position
          if (eventObj.info) {
            this.queueGroup.remove(eventObj.info);
            const infoLabel = this.createEventInfoLabel(event, {
              x: 1.5,
              y: verticalPos,
              z: 0.5
            });
            this.queueGroup.add(infoLabel);
            eventObj.info = infoLabel;
          }
        } else {
          // Create new event ball
          const ballGeometry = new THREE.SphereGeometry(0.25, 24, 24);
          
          // Determine base color from status
          let statusColor;
          switch (event.status) {
            case 'queued':
              statusColor = 0x00b4d8;
              break;
            case 'processing':
            case 'reconcile-start':
              statusColor = 0xffd166;
              break;
            case 'completed':
            case 'reconcile-complete':
              statusColor = 0x06d6a0;
              break;
            case 'failed':
            case 'reconcile-error':
              statusColor = 0xef476f;
              break;
            default:
              statusColor = 0xcccccc;
          }
          
          // Blend status color with reconcile color
          const blendedColor = new THREE.Color(statusColor).lerp(new THREE.Color(reconcileColor), 0.65);
          
          const ballMaterial = new THREE.MeshPhongMaterial({ 
            color: blendedColor
          });
          
          const ball = new THREE.Mesh(ballGeometry, ballMaterial);
          ball.position.set(0, verticalPos, 0.5);
          
          // Add event data to the object for raycasting
          ball.userData = {
            type: 'event',
            data: event
          };
          
          // Add info label
          const infoLabel = this.createEventInfoLabel(event, {
            x: 1.5,
            y: verticalPos,
            z: 0.5
          });
          
          this.queueGroup.add(ball);
          this.queueGroup.add(infoLabel);
          this.eventObjects.set(event.id, { 
            ball: ball, 
            info: infoLabel 
          });
        }
      });
      
      totalIndex += reconcileEvents.length + 0.5; // Add spacing between reconcileId groups
    }
  }
  
  // Create a formatted label for event info
  createEventInfoLabel(event, position) {
    const type = event.type || '';
    const resource = `${event.namespace}/${event.name}`;
    const status = event.status || '';
    const reconcileId = event.reconcileId || '';
    const timestamp = event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : '';
    
    // Create bullet point styled text (similar to tooltips)
    let infoText = 'Event Details\n\n';
    infoText += `• Type: ${type}\n`;
    infoText += `• Resource: ${resource}\n`;
    infoText += `• Status: ${status}\n`;
    
    // Add reconcileID and timestamp
    if (reconcileId) {
      infoText += `• ID: ${reconcileId}\n`;
    }
    
    if (timestamp) {
      infoText += `• Time: ${timestamp}`;
    }
    
    // Create a larger label for better visibility
    const label = createTextLabel(infoText, position, 0.6);
    
    // Add a background panel
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
    
    // Create a group and add both elements
    const group = new THREE.Group();
    group.add(background);
    group.add(label);
    
    return group;
  }
  
  update(speed) {
    // Animate events based on their status
    for (const [id, obj] of this.eventObjects.entries()) {
      if (!obj.ball) continue;
      
      if (id.startsWith('group-')) {
        // Make group labels subtly pulse
        const labelScale = 1 + 0.05 * Math.sin(Date.now() * 0.002);
        if (obj.label) {
          obj.label.scale.set(labelScale, labelScale, 1);
        }
        continue;
      }
      
      const event = this.events.find(e => e.id === id);
      if (event && (event.status === 'processing' || event.status === 'reconcile-start')) {
        // Make processing events pulse
        const scale = 1 + 0.2 * Math.sin(Date.now() * 0.005 * speed);
        obj.ball.scale.set(scale, scale, scale);
      }
    }
  }
}

export default EventQueue; 