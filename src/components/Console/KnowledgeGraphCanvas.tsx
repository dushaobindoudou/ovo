import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

export interface GraphNode {
  id: string;
  name: string;
  type: string;
  mentionCount: number;
  lastSeen: number;
  // KG-F: 视觉权重信号
  qualityScore?: number;
  pinned?: boolean;
  /** 渲染层动态计算：如果该节点 0 边，标记 isolated → 视觉 dim */
  isolated?: boolean;
  /** 渲染层动态计算：搜索匹配高亮 */
  highlighted?: boolean;
}

export interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relation: string;
  strength: number;
}

interface NodeRuntime extends GraphNode {
  pos: THREE.Vector2;
  vel: THREE.Vector2;
  fx: number;
  fy: number;
  radius: number;
  mesh: THREE.Mesh;
  label: HTMLDivElement;
}

interface EdgeRuntime extends GraphEdge {
  line: THREE.Line;
}

const TYPE_COLORS: Record<string, number> = {
  person: 0x3ec5ff,
  project: 0xa78bfa,
  document: 0xfbbf24,
  concept: 0x34d399,
  organization: 0xf472b6,
  location: 0xfb923c,
  application: 0x60a5fa
};

function colorFor(type: string): number {
  return TYPE_COLORS[type?.toLowerCase()] ?? 0x9ca3af;
}

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** KG-E: 让父级控制高度（fullscreen 时拉满；默认仍是 440px） */
  className?: string;
}

/**
 * 力导引知识图谱（自实现，无重依赖）。
 *  - 节点用 sphere，边用 line（normal blending，亮度按 strength 调）
 *  - 物理：库仑斥力 + 弹簧吸引 + 中心拉力 + 阻尼
 *  - 鼠标：raycast 选中节点；滚轮缩放；左键拖动平移
 */
export function KnowledgeGraphCanvas({ nodes, edges, selectedId, onSelect, className }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const labelLayerRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const nodeMapRef = useRef<Map<string, NodeRuntime>>(new Map());
  const edgeListRef = useRef<EdgeRuntime[]>([]);
  const animFrameRef = useRef<number | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; startCamX: number; startCamY: number } | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const nodesKey = useMemo(() => nodes.map((n) => n.id).join("|"), [nodes]);
  const edgesKey = useMemo(() => edges.map((e) => `${e.sourceId}-${e.targetId}-${e.relation}`).join("|"), [edges]);

  // === Three 场景初始化 ===
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const width = container.clientWidth || 600;
    const height = container.clientHeight || 480;
    const scene = new THREE.Scene();
    scene.background = null;
    const camera = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 0.1, 1000);
    camera.position.z = 10;
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);
    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;

    const handleResize = () => {
      if (!container || !cameraRef.current || !rendererRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      cameraRef.current.left = -w / 2;
      cameraRef.current.right = w / 2;
      cameraRef.current.top = h / 2;
      cameraRef.current.bottom = -h / 2;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    const observer = new ResizeObserver(handleResize);
    observer.observe(container);
    return () => {
      observer.disconnect();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
    };
  }, []);

  // === 重建节点/边 ===
  useEffect(() => {
    const scene = sceneRef.current;
    const labelLayer = labelLayerRef.current;
    if (!scene || !labelLayer) return;

    // 清掉旧的
    nodeMapRef.current.forEach((node) => {
      scene.remove(node.mesh);
      node.mesh.geometry.dispose();
      (node.mesh.material as THREE.Material).dispose();
      labelLayer.removeChild(node.label);
    });
    nodeMapRef.current.clear();
    edgeListRef.current.forEach((edge) => {
      scene.remove(edge.line);
      edge.line.geometry.dispose();
      (edge.line.material as THREE.Material).dispose();
    });
    edgeListRef.current = [];

    if (nodes.length === 0) return;

    // KG-F: 节点视觉权重 = quality_score 主导 + mentionCount 兜底 + pinned 1.3x boost
    const radiusFor = (node: GraphNode) => {
      const base = 6 + Math.min(10, Math.sqrt(node.mentionCount ?? 1) * 2.5);
      const q = typeof node.qualityScore === "number" ? node.qualityScore : 0.5;
      const qualityMult = 0.6 + q;
      const pinMult = node.pinned ? 1.3 : 1;
      return base * qualityMult * pinMult;
    };
    // 计算孤立节点（0 边）—— 在边构造之后会回填，先标 false
    const ring = Math.min(220, 80 + nodes.length * 6);
    nodes.forEach((node, i) => {
      const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2;
      const pos = new THREE.Vector2(Math.cos(angle) * ring, Math.sin(angle) * ring);
      const radius = radiusFor(node);
      const geom = new THREE.CircleGeometry(radius, 32);
      // KG-F: 透明度按 quality_score → 低质量 dim
      const q = typeof node.qualityScore === "number" ? node.qualityScore : 0.5;
      const baseOpacity = 0.4 + q * 0.55; // 低质量 0.4，高质量 0.95
      const mat = new THREE.MeshBasicMaterial({
        color: colorFor(node.type),
        transparent: true,
        opacity: baseOpacity
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(pos.x, pos.y, 0);
      mesh.userData.id = node.id;
      scene.add(mesh);

      // KG-F: pinned 节点加金色描边
      if (node.pinned) {
        const ringGeom = new THREE.RingGeometry(radius + 1.5, radius + 3, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.95 });
        const ringMesh = new THREE.Mesh(ringGeom, ringMat);
        ringMesh.position.set(pos.x, pos.y, 0.1);
        scene.add(ringMesh);
        mesh.userData.pinRing = ringMesh;
      }

      const label = document.createElement("div");
      label.className = "ovo-graph-label";
      label.textContent = node.name;
      label.style.cssText = `
        position: absolute; pointer-events: none; transform: translate(-50%, 0);
        font-size: 11px; padding: 1px 6px; border-radius: 6px;
        background: rgba(0,0,0,0.45); color: #fff; white-space: nowrap;
      `;
      labelLayer.appendChild(label);

      nodeMapRef.current.set(node.id, {
        ...node,
        pos,
        vel: new THREE.Vector2(),
        fx: 0,
        fy: 0,
        radius,
        mesh,
        label
      });
    });

    // 构造边
    edges.forEach((edge) => {
      const a = nodeMapRef.current.get(edge.sourceId);
      const b = nodeMapRef.current.get(edge.targetId);
      if (!a || !b) return;
      const geom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(a.pos.x, a.pos.y, -1),
        new THREE.Vector3(b.pos.x, b.pos.y, -1)
      ]);
      const opacity = Math.min(0.7, 0.2 + edge.strength * 0.05);
      const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity });
      const line = new THREE.Line(geom, mat);
      scene.add(line);
      edgeListRef.current.push({ ...edge, line });
    });

    // KG-F: 边构造完后回填 isolated；孤立节点视觉 dim 50%
    const connectedIds = new Set<string>();
    for (const e of edges) {
      connectedIds.add(e.sourceId);
      connectedIds.add(e.targetId);
    }
    for (const node of nodeMapRef.current.values()) {
      const isIsolated = !connectedIds.has(node.id);
      node.isolated = isIsolated;
      if (isIsolated && !node.pinned) {
        const mat = node.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = mat.opacity * 0.45;
        node.label.style.opacity = "0.45";
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodesKey, edgesKey]);

  // === 物理仿真主循环 ===
  useEffect(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const labelLayer = labelLayerRef.current;
    if (!renderer || !scene || !camera || !labelLayer) return;

    const tick = () => {
      const nodeArr = Array.from(nodeMapRef.current.values());
      // 复位力
      for (const node of nodeArr) { node.fx = 0; node.fy = 0; }
      // 库仑斥力 O(n^2)，节点 < 200 都没问题
      for (let i = 0; i < nodeArr.length; i++) {
        for (let j = i + 1; j < nodeArr.length; j++) {
          const a = nodeArr[i];
          const b = nodeArr[j];
          let dx = a.pos.x - b.pos.x;
          let dy = a.pos.y - b.pos.y;
          let dist2 = dx * dx + dy * dy;
          if (dist2 < 1) { dist2 = 1; dx += Math.random() - 0.5; dy += Math.random() - 0.5; }
          const dist = Math.sqrt(dist2);
          const k = 1800 / dist2;
          const fx = (dx / dist) * k;
          const fy = (dy / dist) * k;
          a.fx += fx; a.fy += fy;
          b.fx -= fx; b.fy -= fy;
        }
      }
      // 弹簧吸引
      for (const edge of edgeListRef.current) {
        const a = nodeMapRef.current.get(edge.sourceId);
        const b = nodeMapRef.current.get(edge.targetId);
        if (!a || !b) continue;
        const dx = b.pos.x - a.pos.x;
        const dy = b.pos.y - a.pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const target = 110;
        const k = (dist - target) * 0.04;
        const fx = (dx / dist) * k;
        const fy = (dy / dist) * k;
        a.fx += fx; a.fy += fy;
        b.fx -= fx; b.fy -= fy;
      }
      // 中心拉力
      for (const node of nodeArr) {
        node.fx += -node.pos.x * 0.005;
        node.fy += -node.pos.y * 0.005;
      }
      // 速度积分
      for (const node of nodeArr) {
        node.vel.x = (node.vel.x + node.fx) * 0.78;
        node.vel.y = (node.vel.y + node.fy) * 0.78;
        node.pos.x += Math.max(-12, Math.min(12, node.vel.x));
        node.pos.y += Math.max(-12, Math.min(12, node.vel.y));
        node.mesh.position.set(node.pos.x, node.pos.y, 0);
        // KG-F: pinned 描边环跟随节点位置
        const ringMesh = node.mesh.userData.pinRing as THREE.Mesh | undefined;
        if (ringMesh) ringMesh.position.set(node.pos.x, node.pos.y, 0.1);
      }
      // 更新边
      for (const edge of edgeListRef.current) {
        const a = nodeMapRef.current.get(edge.sourceId);
        const b = nodeMapRef.current.get(edge.targetId);
        if (!a || !b) continue;
        const positions = (edge.line.geometry as THREE.BufferGeometry).attributes.position as THREE.BufferAttribute;
        positions.setXYZ(0, a.pos.x, a.pos.y, -1);
        positions.setXYZ(1, b.pos.x, b.pos.y, -1);
        positions.needsUpdate = true;
      }
      // 更新标签 DOM 位置
      const rect = labelLayer.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const zoom = camera.zoom;
      for (const node of nodeArr) {
        const sx = (node.pos.x - camera.position.x) * zoom + cx;
        const sy = -(node.pos.y - camera.position.y) * zoom + cy + node.radius * zoom + 4;
        node.label.style.left = `${sx}px`;
        node.label.style.top = `${sy}px`;
        const isSelected = node.id === selectedId;
        const isHover = node.id === hoverId;
        const isHighlighted = node.highlighted === true;
        // 标签背景：highlighted > selected > hover > 默认
        node.label.style.background = isHighlighted
          ? "rgba(251, 191, 36, 0.85)"  // 金色 = 搜索命中
          : isSelected
            ? "rgba(124, 58, 237, 0.85)"
            : isHover
              ? "rgba(36, 36, 50, 0.85)"
              : "rgba(0,0,0,0.45)";
        node.label.style.fontWeight = (isSelected || isHighlighted) ? "600" : "400";
        // KG-F: 透明度 = 基础质量 → 命中/选中/hover 拉满；孤立 dim 已经在初始化时压低了
        const mat = node.mesh.material as THREE.MeshBasicMaterial;
        const q = typeof node.qualityScore === "number" ? node.qualityScore : 0.5;
        const baseOp = (node.isolated && !node.pinned) ? (0.4 + q * 0.55) * 0.45 : (0.4 + q * 0.55);
        mat.opacity = isHighlighted ? 1 : isSelected ? 1 : isHover ? Math.min(1, baseOp + 0.15) : baseOp;
      }

      renderer.render(scene, camera);
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [selectedId, hoverId, nodesKey, edgesKey]);

  // === 鼠标交互 ===
  const screenToWorld = useCallback((clientX: number, clientY: number) => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    if (!renderer || !camera) return { x: 0, y: 0 };
    const rect = renderer.domElement.getBoundingClientRect();
    const x = (clientX - rect.left - rect.width / 2) / camera.zoom + camera.position.x;
    const y = -(clientY - rect.top - rect.height / 2) / camera.zoom + camera.position.y;
    return { x, y };
  }, []);

  const findNodeAt = useCallback((clientX: number, clientY: number): string | null => {
    const wp = screenToWorld(clientX, clientY);
    let hit: string | null = null;
    let bestDist = Infinity;
    nodeMapRef.current.forEach((node) => {
      const dx = wp.x - node.pos.x;
      const dy = wp.y - node.pos.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < node.radius && d < bestDist) {
        bestDist = d;
        hit = node.id;
      }
    });
    return hit;
  }, [screenToWorld]);

  const handleClick = (e: React.MouseEvent) => {
    const id = findNodeAt(e.clientX, e.clientY);
    onSelect?.(id);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragRef.current) {
      const camera = cameraRef.current;
      if (!camera) return;
      const dx = (e.clientX - dragRef.current.startX) / camera.zoom;
      const dy = (e.clientY - dragRef.current.startY) / camera.zoom;
      camera.position.x = dragRef.current.startCamX - dx;
      camera.position.y = dragRef.current.startCamY + dy;
      return;
    }
    const id = findNodeAt(e.clientX, e.clientY);
    setHoverId(id);
    if (tooltipRef.current) {
      if (id) {
        const node = nodeMapRef.current.get(id);
        if (node) {
          tooltipRef.current.style.display = "block";
          tooltipRef.current.style.left = `${e.clientX + 8}px`;
          tooltipRef.current.style.top = `${e.clientY + 8}px`;
          tooltipRef.current.textContent = `${node.name} · ${node.type} · 提及 ${node.mentionCount}`;
        }
      } else {
        tooltipRef.current.style.display = "none";
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const id = findNodeAt(e.clientX, e.clientY);
    if (id) return; // 点节点的不算拖拽
    const camera = cameraRef.current;
    if (!camera) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startCamX: camera.position.x,
      startCamY: camera.position.y
    };
  };
  const handleMouseUp = () => { dragRef.current = null; };

  const handleWheel = (e: React.WheelEvent) => {
    const camera = cameraRef.current;
    if (!camera) return;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    camera.zoom = Math.max(0.3, Math.min(3, camera.zoom * factor));
    camera.updateProjectionMatrix();
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-base)] ${className ?? "h-[440px]"}`}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      style={{ cursor: hoverId ? "pointer" : dragRef.current ? "grabbing" : "grab" }}
    >
      <div ref={labelLayerRef} className="pointer-events-none absolute inset-0 overflow-hidden" />
      <div
        ref={tooltipRef}
        style={{ display: "none", position: "fixed", zIndex: 50 }}
        className="rounded-md bg-black/80 px-2 py-1 text-xs text-white shadow"
      />
      <div className="pointer-events-none absolute right-2 top-2 rounded bg-black/40 px-2 py-1 text-[10px] text-white/70">
        滚轮缩放 · 拖拽平移 · 点击节点查看详情
      </div>
    </div>
  );
}
