import * as THREE from 'three';

// Modelo 3D local de una laptop, construido con geometrías de Three.js.
// Expone createAsset(props) para usar directamente con <primitive object={obj} />.
const PALETTES = {
  'matte-black-2025': {
    body: '#151b23',
    bottom: '#0c1118',
    deck: '#202a36',
    keyTop: '#111820',
    hinge: '#465569',
    bezel: '#070b10',
    screen: '#0b1a2f',
    screenEmissive: '#1d4ed8',
    accent: '#38bdf8',
    logo: '#e2e8f0',
  },
  'silver-2025': {
    body: '#cbd5e1',
    bottom: '#94a3b8',
    deck: '#e2e8f0',
    keyTop: '#1e293b',
    hinge: '#64748b',
    bezel: '#0f172a',
    screen: '#0b1a2f',
    screenEmissive: '#2563eb',
    accent: '#0ea5e9',
    logo: '#0f172a',
  },
  'gray-2025': {
    body: '#8b949e',
    bottom: '#6b7280',
    deck: '#b8c0ca',
    keyTop: '#374151',
    hinge: '#9ca3af',
    bezel: '#1f2937',
    screen: '#0b1a2f',
    screenEmissive: '#3b82f6',
    accent: '#60a5fa',
    logo: '#f8fafc',
  },
};

const DEFAULT_COLORWAY = 'matte-black-2025';

function standard(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.42,
    metalness: 0.35,
    ...options,
  });
}

function addBox(parent, size, position, material, rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addCylinder(parent, radius, length, position, rotation, material) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 20),
    material,
  );
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function makeScreenTexture(palette, props = {}) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 288;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const gradient = ctx.createLinearGradient(0, 0, 512, 288);
  gradient.addColorStop(0, '#0b1220');
  gradient.addColorStop(0.55, '#12224a');
  gradient.addColorStop(1, palette.screenEmissive);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 288);

  // Código SGL grande en la pantalla.
  ctx.textAlign = 'center';
  ctx.fillStyle = palette.logo;
  ctx.font = 'bold 62px ui-monospace, Consolas, monospace';
  ctx.fillText(String(props.codigo || 'SGL-0000'), 256, 150);

  const texture = new THREE.CanvasTexture(canvas);
  if ('colorSpace' in texture) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createAsset(props = {}) {
  const colorway = props.colorway || DEFAULT_COLORWAY;
  const palette = PALETTES[colorway] || PALETTES[DEFAULT_COLORWAY];

  const group = new THREE.Group();
  group.name = 'laptop-e775ba';
  group.userData.colorway = colorway;

  const bodyMat = standard(palette.body, { roughness: 0.34, metalness: 0.55 });
  const bottomMat = standard(palette.bottom, { roughness: 0.5, metalness: 0.4 });
  const deckMat = standard(palette.deck, { roughness: 0.52, metalness: 0.3 });
  const keyMat = standard(palette.keyTop, { roughness: 0.75, metalness: 0.12 });
  const hingeMat = standard(palette.hinge, { roughness: 0.3, metalness: 0.8 });
  const bezelMat = standard(palette.bezel, { roughness: 0.28, metalness: 0.25 });
  const accentMat = standard(palette.accent, {
    roughness: 0.35,
    metalness: 0.2,
    emissive: palette.accent,
    emissiveIntensity: 0.35,
  });
  const logoMat = standard(palette.logo, { roughness: 0.55, metalness: 0.1 });

  // Base y carcasa inferior.
  addBox(group, [3.2, 0.14, 2.1], [0, 0.07, 0], bodyMat);
  addBox(group, [3.06, 0.06, 1.96], [0, 0.015, 0], bottomMat);
  addBox(group, [2.98, 0.02, 1.18], [0, 0.15, -0.45], deckMat);
  addBox(group, [2.7, 0.012, 0.018], [0, 0.078, 1.052], accentMat);

  // Pies y puertos.
  for (const x of [-1.25, 1.25]) {
    for (const z of [-0.8, 0.8]) {
      addCylinder(group, 0.06, 0.03, [x, -0.015, z], [0, 0, 0], hingeMat);
    }
  }
  for (const side of [-1, 1]) {
    addBox(group, [0.02, 0.05, 0.22], [side * 1.61, 0.075, -0.45], hingeMat);
    addBox(group, [0.02, 0.04, 0.14], [side * 1.61, 0.075, 0.15], bezelMat);
  }

  // Teclado (incluye barra espaciadora).
  const keyGeo = new THREE.BoxGeometry(0.17, 0.028, 0.15);
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 13; col += 1) {
      if (row === 3 && col >= 4 && col <= 8) continue;
      const key = new THREE.Mesh(keyGeo, keyMat);
      key.position.set(-1.32 + col * 0.22, 0.177, -0.78 + row * 0.22);
      key.castShadow = true;
      group.add(key);
    }
  }
  addBox(group, [1.08, 0.028, 0.15], [0, 0.177, -0.12], keyMat);

  // Touchpad.
  addBox(group, [1.04, 0.012, 0.64], [0, 0.152, 0.55], hingeMat);
  addBox(group, [0.94, 0.014, 0.56], [0, 0.16, 0.55], deckMat);

  // Bisagra.
  addCylinder(group, 0.055, 2.75, [0, 0.17, -1.03], [0, 0, Math.PI / 2], hingeMat);
  for (const x of [-1.15, 1.15]) {
    addBox(group, [0.22, 0.14, 0.18], [x, 0.16, -1.03], hingeMat);
  }

  // Pantalla inclinada ligeramente hacia atrás.
  const screen = new THREE.Group();
  screen.position.set(0, 0.17, -1.03);
  screen.rotation.x = -0.14;
  group.add(screen);

  addBox(screen, [3.1, 1.88, 0.1], [0, 0.94, 0], bezelMat);

  const texture = makeScreenTexture(palette, props);
  const screenMat = new THREE.MeshBasicMaterial({
    color: texture ? '#ffffff' : palette.screen,
    map: texture,
    toneMapped: false,
  });
  addBox(screen, [2.84, 1.6, 0.012], [0, 0.96, 0.058], screenMat);

  const glassMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 0.05,
    roughness: 0.1,
    metalness: 0,
    depthWrite: false,
  });
  addBox(screen, [2.84, 1.6, 0.006], [0, 0.96, 0.067], glassMat);

  const cameraDot = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 12), bezelMat);
  cameraDot.position.set(0, 1.78, 0.058);
  screen.add(cameraDot);

  addBox(screen, [0.42, 0.035, 0.012], [0, 0.1, 0.058], accentMat);
  addBox(screen, [0.22, 0.018, 0.012], [0.85, 0.1, 0.058], logoMat);
  for (const side of [-1, 1]) {
    addBox(screen, [0.05, 0.5, 0.012], [side * 1.47, 0.95, 0.058], hingeMat);
  }

  // Escalar y centrar para que el Canvas con cámara [3, 2, 4] lo encuadre bien.
  group.scale.setScalar(1.75);
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group);
  group.position.sub(bounds.getCenter(new THREE.Vector3()));

  return group;
}
