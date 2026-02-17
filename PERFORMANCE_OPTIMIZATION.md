# Pythagora Performance Optimization Plan

## Current State Analysis

### Already Optimized ✓
- Physics iterations: 4 (reduced from 10)
- `allowSleep`: enabled for static objects
- `broadphase`: "Naive" for small object counts
- `powerPreference`: "high-performance"
- Some components use `React.memo`

## Performance Bottlenecks & Solutions

### 1. WebGL Renderer Optimizations (HIGH IMPACT)

#### Current (Expensive)
```tsx
<Canvas
  shadows           // ❌ Shadow mapping is very expensive
  gl={{
    antialias: true,  // ❌ MSAA 2-4x performance cost
    alpha: false,
    powerPreference: "high-performance"
  }}
>
```

#### Optimized
```tsx
<Canvas
  shadows={false}     // Disable shadows or use selective
  gl={{
    antialias: false,  // Disable for mobile, use FXAA instead
    alpha: false,
    powerPreference: "high-performance",
    stencil: true,
    depth: true,
    logarithmicDepthBuffer: false  // Disable unless needed
  }}
  dpr={[1, 2]}        // Limit pixel ratio for mobile
  frameloop="demand"   // Only render when needed
>
```

### 2. Frame Rate Management

#### Add Adaptive Performance
```tsx
const [fps, setFps] = useState(60);
const frameLimiter = useRef<number>();

useEffect(() => {
  // Detect device capability
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const targetFPS = isMobile ? 30 : 60;

  // Adaptive quality based on FPS
  const checkPerformance = () => {
    const start = performance.now();
    requestAnimationFrame(() => {
      const frameTime = performance.now() - start;
      if (frameTime > 30) { // Drop below 30fps
        // Reduce quality settings
      }
    });
  };
}, []);
```

### 3. Object Pooling (HIGH IMPACT)

#### Problem: Creating/destroying marbles causes GC pauses

#### Solution: Object Pool
```tsx
// Marble pool for reusing marble objects
const marblePool = useRef<THREE.Mesh[]>([]);
const maxPoolSize = 20;

const getMarbleFromPool = () => {
  if (marblePool.current.length > 0) {
    return marblePool.current.pop()!;
  }
  return createNewMarble();
};

const returnMarbleToPool = (marble: THREE.Mesh) => {
  if (marblePool.current.length < maxPoolSize) {
    marble.visible = false;
    marblePool.current.push(marble);
  } else {
    marble.geometry.dispose();
    marble.material.dispose();
  }
};
```

### 4. Ripple Effect Optimization

#### Current: Creates new mesh for each ripple
```tsx
const Ripple = React.memo(({ position, color, onComplete }: RippleProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [life, setLife] = useState(1);

  useFrame((_state, delta) => {
    setLife(prev => Math.max(0, prev - decay));
  });

  return <mesh ref={meshRef} position={position}>
    <ringGeometry args={[0.1, 0.3, 32]} />
  </mesh>;
});
```

#### Optimized: Shared geometry & InstancedMesh
```tsx
// Shared geometry (created once)
const rippleGeometry = useMemo(() =>
  new THREE.RingGeometry(0.1, 0.3, 16), // Reduce segments
  []
);

const rippleMaterial = useMemo(() =>
  new THREE.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }),
  []
);

// Use InstancedMesh for multiple ripples
const RippleSystem = () => {
  const instancedRef = useRef<THREE.InstancedMesh>(null);
  const [ripples] = useState(() => Array(20).fill(null).map(() => ({
    active: false,
    life: 0,
    position: [0, 0, 0],
    color: new THREE.Color()
  })));

  useFrame(() => {
    if (!instancedRef.current) return;

    const dummy = new THREE.Object3D();
    ripples.forEach((ripple, i) => {
      if (ripple.active) {
        ripple.life -= 0.016;
        if (ripple.life <= 0) {
          ripple.active = false;
        }
        dummy.position.set(...ripple.position);
        dummy.scale.setScalar(1 + (1 - ripple.life) * 3);
        dummy.updateMatrix();
        instancedRef.current.setMatrixAt(i, dummy.matrix);
      }
    });
    instancedRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={instancedRef}
      args={[rippleGeometry, rippleMaterial, 20]}
      count={20}
    />
  );
};
```

### 5. Component Memoization

#### Add React.memo to all expensive components
```tsx
export const Physics3DCanvas = React.memo<Physics3DCanvasProps>(React.forwardRef((props, ref) => {
  // ...
}), (prevProps, nextProps) => {
  // Custom comparison
  return (
    prevProps.nodes === nextProps.nodes &&
    prevProps.selectedNodeType === nextProps.selectedNodeType
  );
});
```

### 6. Reduce Re-renders

#### Use useCallback and useMemo extensively
```tsx
const handleModuleSelect = useCallback((moduleType: string) => {
  if (onModuleTypeChange) {
    onModuleTypeChange(moduleType);
  }
}, [onModuleTypeChange]);

const moduleTypes = useMemo(() => [
  { type: 'marble', symbol: '◉', name: 'ORIGIN', key: '1' },
  { type: 'ramp', symbol: '△', name: 'SLOPE', key: '2' },
  // ...
], []);
```

### 7. Asset Optimization

#### Audio: Use shorter samples
```tsx
// In synthBridge3D.ts
const shortSamples = {
  chime: chimeSound.slice(0, 44100 * 0.5), // First 0.5 seconds only
  bell: bellSound.slice(0, 44100 * 1.0),
};
```

### 8. Lazy Loading

#### Code split heavy components
```tsx
const Scene = React.lazy(() => import('./Scene'));
const Physics3DCanvas = () => (
  <Suspense fallback={<LoadingSpinner />}>
    <Canvas>
      <Scene />
    </Canvas>
  </Suspense>
);
```

### 9. Memory Management

#### Clean up on unmount
```tsx
useEffect(() => {
  return () => {
    // Dispose geometries, materials, textures
    marbles.forEach(marble => {
      marble.geometry?.dispose();
      (marble.material as THREE.Material)?.dispose();
    });

    // Stop audio contexts
    synthBridge?.dispose();
  };
}, []);
```

### 10. Physics Optimization

#### Reduce physics substeps
```tsx
<Physics
  gravity={[0, -15, 0]}
  iterations={3}  // Reduce from 4 to 3
  broadphase="Naive"
  defaultContactMaterial={{
    friction: 0.4,
    restitution: 0.7
  }}
  allowSleep={true}
  solver="GS"  // Gauss-Seidel is faster than SAP for this use case
>
```

## Implementation Priority

### Phase 1: Quick Wins (Implement Now)
1. Disable antialias on mobile
2. Add DPR limiting
3. Reduce geometry segments
4. Add React.memo to expensive components

### Phase 2: Medium Impact
5. Implement object pooling for marbles
6. Optimize ripple system with InstancedMesh
7. Add frame rate limiting

### Phase 3: Advanced
8. Implement LOD system
9. Progressive loading
10. Web Worker for physics calculations

## Performance Monitoring

Add FPS counter:
```tsx
const Stats = ({ show }: { show: boolean }) => {
  const [fps, setFps] = useState(0);

  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();

    const loop = () => {
      frameCount++;
      const now = performance.now();
      if (now >= lastTime + 1000) {
        setFps(Math.round(frameCount * 1000 / (now - lastTime)));
        frameCount = 0;
        lastTime = now;
      }
      requestAnimationFrame(loop);
    };
    loop();
  }, []);

  return show ? <div style={{ color: 'white' }}>{fps} FPS</div> : null;
};
```

## Expected Results

| Optimization | FPS Improvement | Memory Reduction |
|--------------|-----------------|------------------|
| Disable antialias | +20-30% | - |
| Object pooling | +15-25% | -30% |
| Instanced ripples | +10-15% | -50% |
| Reduced geometry | +5-10% | -20% |
| Component memoization | +10-20% | - |
| **Combined** | **+40-60%** | **-40%** |
