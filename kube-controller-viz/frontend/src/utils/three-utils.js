import * as THREE from 'three';

// Create a text label using a sprite
export function createTextLabel(text, position, size = 1) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  // Split text into lines
  const lines = text.split('\n');
  const lineHeight = 28; // Slightly reduced line height for better spacing
  const padding = 20; // Padding
  const maxCharsPerLine = 45; // For word wrapping - slightly wider
  
  // Process lines for word wrapping
  const wrappedLines = [];
  lines.forEach(line => {
    // Handle basic word wrapping for long lines
    if (line.length > maxCharsPerLine) {
      let currentLine = '';
      const words = line.split(' ');
      
      words.forEach(word => {
        const testLine = currentLine + (currentLine ? ' ' : '') + word;
        if (testLine.length <= maxCharsPerLine) {
          currentLine = testLine;
        } else {
          wrappedLines.push(currentLine);
          currentLine = word;
        }
      });
      
      if (currentLine) {
        wrappedLines.push(currentLine);
      }
    } else {
      wrappedLines.push(line);
    }
  });
  
  // Find title line (if exists)
  let titleLine = '';
  let hasTitle = false;
  if (wrappedLines.length > 0 && !wrappedLines[0].startsWith('•')) {
    titleLine = wrappedLines[0];
    hasTitle = true;
  }
  
  // Calculate canvas dimensions based on wrapped text
  canvas.width = Math.max(500, maxCharsPerLine * 14); // Fixed width for better text layout
  canvas.height = Math.max(200, (wrappedLines.length * lineHeight) + (padding * 2) + (hasTitle ? 30 : 0));
  
  // Fill with gradient background
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, 'rgba(22, 33, 62, 0.95)');   // Dark blue at top
  gradient.addColorStop(1, 'rgba(13, 21, 45, 0.95)');   // Darker blue at bottom
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  
  // Add subtle rounded corners with a clip path
  const radius = 15;
  context.beginPath();
  context.moveTo(radius, 0);
  context.lineTo(canvas.width - radius, 0);
  context.quadraticCurveTo(canvas.width, 0, canvas.width, radius);
  context.lineTo(canvas.width, canvas.height - radius);
  context.quadraticCurveTo(canvas.width, canvas.height, canvas.width - radius, canvas.height);
  context.lineTo(radius, canvas.height);
  context.quadraticCurveTo(0, canvas.height, 0, canvas.height - radius);
  context.lineTo(0, radius);
  context.quadraticCurveTo(0, 0, radius, 0);
  context.closePath();
  context.clip();
  
  // Re-apply the gradient after clip
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  
  // Add subtle highlight to top
  context.fillStyle = 'rgba(255, 255, 255, 0.05)';
  context.fillRect(0, 0, canvas.width, 5);
  
  // Add border
  context.strokeStyle = 'rgba(0, 180, 216, 0.8)';
  context.lineWidth = 2;
  context.roundRect(2, 2, canvas.width - 4, canvas.height - 4, radius - 2);
  context.stroke();
  
  // Title section if exists
  if (hasTitle) {
    // Title background
    const titleGradient = context.createLinearGradient(0, 0, canvas.width, 0);
    titleGradient.addColorStop(0, 'rgba(0, 180, 216, 0.9)');
    titleGradient.addColorStop(1, 'rgba(0, 150, 199, 0.7)');
    context.fillStyle = titleGradient;
    context.fillRect(0, 0, canvas.width, 45);
    
    // Title text
    context.font = 'bold 26px Roboto';
    context.fillStyle = '#ffffff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(titleLine, canvas.width / 2, 22);
    
    // Reset alignment for body text
    context.textAlign = 'left';
    context.textBaseline = 'top';
  }
  
  // Body text - draw each line with different styling based on content
  context.font = '22px Roboto';
  context.fillStyle = '#ffffff';
  
  const titleOffset = hasTitle ? 55 : 0; // Add extra space if we have a title
  
  wrappedLines.forEach((line, index) => {
    if (index === 0 && hasTitle) {
      return; // Skip title line as we've already drawn it
    }
    
    const lineY = titleOffset + padding + ((hasTitle ? index - 1 : index) * lineHeight);
    
    // Style field names in a different color
    if (line.includes('•')) {
      const parts = line.split('•');
      if (parts.length > 1) {
        // Draw bullet
        context.fillStyle = '#00b4d8';
        context.fillText('•', padding, lineY);
        
        // Check if this line has a field name (with colon)
        const fieldParts = parts[1].split(':');
        if (fieldParts.length > 1) {
          // Draw field name in blue
          context.fillStyle = '#00b4d8';
          context.font = 'bold 22px Roboto';
          context.fillText(fieldParts[0] + ':', padding + 15, lineY);
          
          // Draw field value in white
          context.fillStyle = '#ffffff';
          context.font = '22px Roboto';
          const valueX = padding + 15 + context.measureText(fieldParts[0] + ': ').width;
          context.fillText(fieldParts.slice(1).join(':'), valueX, lineY);
        } else {
          // Just draw the whole line
          context.fillStyle = '#ffffff';
          context.fillText(parts[1], padding + 15, lineY);
        }
      } else {
        // Just draw the whole line if no parts
        context.fillStyle = '#ffffff';
        context.fillText(line, padding, lineY);
      }
    } else if (line.startsWith('  -')) {
      // Indented subfields
      context.fillStyle = '#8dd7ec';
      context.fillText(line, padding + 15, lineY);
    } else {
      // Regular text
      context.fillStyle = '#ffffff';
      context.fillText(line, padding, lineY);
    }
  });
  
  // Create sprite
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture });
  const sprite = new THREE.Sprite(material);
  
  // Position and scale - adjust scale based on canvas dimensions
  sprite.position.set(position.x, position.y, position.z);
  const aspectRatio = canvas.width / canvas.height;
  sprite.scale.set(size * 4 * aspectRatio, size * 4, 1);
  
  return sprite;
}

// Create a curved arrow
export function createCurvedArrow(start, end, controlPoint, color = 0x00b4d8) {
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(start.x, start.y, start.z),
    new THREE.Vector3(controlPoint.x, controlPoint.y, controlPoint.z),
    new THREE.Vector3(end.x, end.y, end.z)
  );
  
  const points = curve.getPoints(50);
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color });
  
  return new THREE.Line(geometry, material);
}

// Create a particle system for flowing effects
export function createParticleFlow(curve, count = 20, color = 0x00b4d8) {
  const particles = new THREE.Group();
  
  for (let i = 0; i < count; i++) {
    const geometry = new THREE.SphereGeometry(0.05, 8, 8);
    const material = new THREE.MeshBasicMaterial({ color });
    const particle = new THREE.Mesh(geometry, material);
    
    // Set initial position along the curve
    const position = curve.getPoint(i / count);
    particle.position.copy(position);
    
    // Store the particle's progress along the curve
    particle.userData = {
      progress: i / count
    };
    
    particles.add(particle);
  }
  
  // Add update function to the group
  particles.update = function(speed) {
    this.children.forEach(particle => {
      // Update progress
      particle.userData.progress += 0.005 * speed;
      if (particle.userData.progress > 1) {
        particle.userData.progress = 0;
      }
      
      // Update position
      const position = curve.getPoint(particle.userData.progress);
      particle.position.copy(position);
    });
  };
  
  return particles;
} 