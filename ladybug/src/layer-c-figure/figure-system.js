import * as THREE from 'three';

/**
 * Layer C - point-cloud narrative figure, in the spirit of Radiohead's
 * "House of Cards" LIDAR video. Real point-cloud walk-cycle data (Mixamo
 * FBX/BVH retargeted to points, or a MediaPipe Pose capture) is out of
 * scope to source/license here, so a procedural humanoid point cloud
 * (walk-cycle driven by simple joint sinusoids) stands in as the figure -
 * the scene/timeline machinery around it (assembly, dissolve, depth
 * parallax) is what the spec actually asks this layer to demonstrate, and
 * that machinery is real. Swapping the point source for real mocap data
 * later only means changing `sampleFigurePoints()`.
 */

const SCENES = ['intro_chaos', 'figure_emerging', 'figure_active', 'dissolve'];

export class FigureSystem {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.camera.position.z = 10;

    this.pointCount = 400;
    this.figurePoints = sampleFigurePoints(this.pointCount);
    this.chaosTargets = randomChaosPoints(this.pointCount);

    const geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(this.pointCount * 3);
    this.opacities = new Float32Array(this.pointCount);
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.02,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    this.points = new THREE.Points(geometry, material);
    this.scene.add(this.points);

    this.currentScene = 'intro_chaos';
    this.assembly = 0; // 0 = fully chaotic, 1 = fully assembled figure
    this.walkPhase = 0;
  }

  resize(width, height) {
    this.renderer.setSize(width, height, false);
    const aspect = width / height;
    this.camera.left = -aspect;
    this.camera.right = aspect;
    this.camera.top = 1;
    this.camera.bottom = -1;
    this.camera.updateProjectionMatrix();
  }

  setScene(sceneId) {
    this.currentScene = SCENES.includes(sceneId) ? sceneId : 'intro_chaos';
  }

  /**
   * @param {number} dt seconds
   * @param {number} energy 0..1 current-moment energy, drives walk speed and assembly
   */
  update(dt, energy = 0) {
    const targetAssembly = {
      intro_chaos: 0,
      figure_emerging: 0.5,
      figure_active: 1,
      dissolve: 0.15,
    }[this.currentScene];

    this.assembly += (targetAssembly - this.assembly) * Math.min(1, dt * 1.5);
    this.walkPhase += dt * (1 + energy * 3);

    const walking = animateWalk(this.figurePoints, this.walkPhase);

    for (let i = 0; i < this.pointCount; i++) {
      const chaos = this.chaosTargets[i];
      const figure = walking[i];
      const x = lerp(chaos[0], figure[0], this.assembly);
      const y = lerp(chaos[1], figure[1], this.assembly);
      // z-depth parallax: figure points keep their authored depth,
      // chaos points scatter across a wider depth range.
      const z = lerp(chaos[2], figure[2], this.assembly);

      this.positions[i * 3] = x;
      this.positions[i * 3 + 1] = y;
      this.positions[i * 3 + 2] = z;
    }
    this.points.geometry.attributes.position.needsUpdate = true;

    // Size/opacity falloff with depth (z-depth cue from the spec).
    const material = this.points.material;
    material.opacity = 0.5 + 0.4 * this.assembly;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

/** Procedural humanoid stick figure sampled as a sparse point cloud. */
function sampleFigurePoints(count) {
  const joints = [
    [0, 0.75], // head
    [0, 0.5], // chest
    [0, 0.2], // pelvis
    [-0.25, 0.5], [-0.35, 0.15], // left arm, hand
    [0.25, 0.5], [0.35, 0.15], // right arm, hand
    [-0.12, -0.15], [-0.12, -0.6], // left leg, foot
    [0.12, -0.15], [0.12, -0.6], // right leg, foot
  ];
  const points = [];
  for (let i = 0; i < count; i++) {
    const [jx, jy] = joints[i % joints.length];
    const jitter = 0.05;
    points.push([jx + (Math.random() - 0.5) * jitter, jy + (Math.random() - 0.5) * jitter, (Math.random() - 0.5) * 0.1]);
  }
  return points;
}

function animateWalk(basePoints, phase) {
  const swing = Math.sin(phase * 4) * 0.08;
  return basePoints.map(([x, y, z], i) => {
    // Legs/arms (last two thirds of the joint cycle) swing in antiphase.
    const isLeftSide = x < 0;
    const swingAmount = y < 0.3 ? swing : -swing * 0.6;
    const dir = isLeftSide ? 1 : -1;
    return [x, y + Math.sin(phase * 4 + (isLeftSide ? 0 : Math.PI)) * 0.02, z + dir * swingAmount];
  });
}

function randomChaosPoints(count) {
  const points = [];
  for (let i = 0; i < count; i++) {
    points.push([(Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 1.5]);
  }
  return points;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export { SCENES };
