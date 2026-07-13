import { useEffect, useRef } from "react";

export function CinematicBackdrop({ active = true }: { active?: boolean }) {
  const threeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const p5LayerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!active) return undefined;
    if (window.matchMedia("(max-width: 760px)").matches) return undefined;
    const canvas = threeCanvasRef.current;
    if (!canvas) return undefined;

    let disposed = false;
    let cleanup: (() => void) | null = null;

    void import("three").then((THREE) => {
      if (disposed) return;

      const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 80);
      camera.position.set(0, 0, 16);

      const particleCount = 1300;
      const positions = new Float32Array(particleCount * 3);
      const colors = new Float32Array(particleCount * 3);

      for (let index = 0; index < particleCount; index += 1) {
        const radius = 4 + Math.random() * 18;
        const angle = Math.random() * Math.PI * 2;
        const depth = (Math.random() - 0.5) * 22;
        positions[index * 3] = Math.cos(angle) * radius;
        positions[index * 3 + 1] = Math.sin(angle) * radius * 0.38 + (Math.random() - 0.5) * 5;
        positions[index * 3 + 2] = depth;

        const cyanBias = 0.45 + Math.random() * 0.4;
        colors[index * 3] = 0.15 + Math.random() * 0.25;
        colors[index * 3 + 1] = 0.55 + cyanBias * 0.35;
        colors[index * 3 + 2] = 0.75 + cyanBias * 0.25;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

      const material = new THREE.PointsMaterial({
        size: 0.035,
        vertexColors: true,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const particles = new THREE.Points(geometry, material);
      scene.add(particles);

      const lineGeometry = new THREE.BufferGeometry();
      const linePositions = new Float32Array(180 * 3);
      for (let index = 0; index < 180; index += 1) {
        const x = (index / 179 - 0.5) * 26;
        linePositions[index * 3] = x;
        linePositions[index * 3 + 1] = Math.sin(index * 0.22) * 0.8;
        linePositions[index * 3 + 2] = -5;
      }
      lineGeometry.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
      const line = new THREE.Line(
        lineGeometry,
        new THREE.LineBasicMaterial({
          color: 0xff5e70,
          transparent: true,
          opacity: 0.26,
          blending: THREE.AdditiveBlending,
        }),
      );
      scene.add(line);

      let animationFrame = 0;

      const resize = () => {
        renderer.setSize(window.innerWidth, window.innerHeight, false);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
      };

      const animate = (time: number) => {
        const seconds = time * 0.001;
        particles.rotation.y = seconds * 0.035;
        particles.rotation.x = Math.sin(seconds * 0.18) * 0.08;
        line.rotation.z = Math.sin(seconds * 0.25) * 0.04;
        line.position.y = Math.sin(seconds * 0.8) * 0.3;
        renderer.render(scene, camera);
        animationFrame = requestAnimationFrame(animate);
      };

      resize();
      animationFrame = requestAnimationFrame(animate);
      window.addEventListener("resize", resize);

      cleanup = () => {
        window.removeEventListener("resize", resize);
        cancelAnimationFrame(animationFrame);
        geometry.dispose();
        material.dispose();
        lineGeometry.dispose();
        line.material.dispose();
        renderer.dispose();
      };
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [active]);

  useEffect(() => {
    if (!active) return undefined;
    if (window.matchMedia("(max-width: 760px)").matches) return undefined;
    const parent = p5LayerRef.current;
    if (!parent) return undefined;

    let disposed = false;
    let instance: { remove(): void } | null = null;

    void import("p5").then((module) => {
      if (disposed) return;
      const P5 = module.default;
      const sketch = (p: any) => {
        p.setup = () => {
          const canvas = p.createCanvas(parent.clientWidth, parent.clientHeight, p.WEBGL);
          canvas.parent(parent);
          p.pixelDensity(Math.min(window.devicePixelRatio, 1.5));
        };

        p.windowResized = () => {
          p.resizeCanvas(parent.clientWidth, parent.clientHeight);
        };

        p.draw = () => {
          p.clear();
          p.noFill();
          p.rotateZ(p.frameCount * 0.0018);
          const base = Math.min(p.width, p.height) * 0.28;
          for (let ring = 0; ring < 5; ring += 1) {
            const radius = base + ring * 34 + Math.sin(p.frameCount * 0.018 + ring) * 8;
            p.stroke(52, 231, 255, 32 - ring * 4);
            p.strokeWeight(1);
            p.beginShape();
            for (let step = 0; step <= 180; step += 1) {
              const angle = (step / 180) * Math.PI * 2;
              const noise = p.noise(Math.cos(angle) + ring, Math.sin(angle) + ring, p.frameCount * 0.004);
              const distorted = radius + (noise - 0.5) * 42;
              p.vertex(Math.cos(angle) * distorted, Math.sin(angle) * distorted * 0.48);
            }
            p.endShape();
          }

          p.stroke(255, 94, 112, 46);
          p.strokeWeight(1.3);
          p.beginShape();
          for (let step = 0; step < 160; step += 1) {
            const x = p.map(step, 0, 159, -p.width * 0.45, p.width * 0.45);
            const y = Math.sin(step * 0.16 + p.frameCount * 0.06) * 20 + Math.sin(step * 0.047) * 36;
            p.vertex(x, y);
          }
          p.endShape();
        };
      };

      instance = new P5(sketch);
    });

    return () => {
      disposed = true;
      instance?.remove();
    };
  }, [active]);

  return (
    <div className="cinematic-backdrop" aria-hidden="true">
      {active && <canvas ref={threeCanvasRef} className="three-backdrop" />}
      {active && <div ref={p5LayerRef} className="p5-backdrop" />}
      <div className="film-grain" />
      <div className="vignette" />
      <div className="chromatic-edge chromatic-edge-left" />
      <div className="chromatic-edge chromatic-edge-right" />
    </div>
  );
}
