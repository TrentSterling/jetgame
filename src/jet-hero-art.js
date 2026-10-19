// Original JET/015 procedural aircraft, optimized for the existing game.
// Geometry merge helpers derive from three.js BufferGeometryUtils.
// Copyright (c) 2010-2026 three.js authors, MIT; see LICENSE.
// JET/015 runtime: runtime.js
import * as T6 from "three/webgpu";

// JET/015 runtime: merge.js
import {
  BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  TriangleFanDrawMode,
  TriangleStripDrawMode,
  TrianglesDrawMode,
  Vector3
} from "three/webgpu";
function mergeGeometries(geometries, useGroups = false) {
  const isIndexed = geometries[0].index !== null;
  const attributesUsed = new Set(Object.keys(geometries[0].attributes));
  const morphAttributesUsed = new Set(Object.keys(geometries[0].morphAttributes));
  const attributes = {};
  const morphAttributes = {};
  const morphTargetsRelative = geometries[0].morphTargetsRelative;
  const mergedGeometry = new BufferGeometry();
  let offset = 0;
  for (let i = 0; i < geometries.length; ++i) {
    const geometry = geometries[i];
    let attributesCount = 0;
    if (isIndexed !== (geometry.index !== null)) {
      console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " + i + ". All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them.");
      return null;
    }
    for (const name in geometry.attributes) {
      if (!attributesUsed.has(name)) {
        console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " + i + '. All geometries must have compatible attributes; make sure "' + name + '" attribute exists among all geometries, or in none of them.');
        return null;
      }
      if (attributes[name] === void 0) attributes[name] = [];
      attributes[name].push(geometry.attributes[name]);
      attributesCount++;
    }
    if (attributesCount !== attributesUsed.size) {
      console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " + i + ". Make sure all geometries have the same number of attributes.");
      return null;
    }
    if (morphTargetsRelative !== geometry.morphTargetsRelative) {
      console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " + i + ". .morphTargetsRelative must be consistent throughout all geometries.");
      return null;
    }
    for (const name in geometry.morphAttributes) {
      if (!morphAttributesUsed.has(name)) {
        console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " + i + ".  .morphAttributes must be consistent throughout all geometries.");
        return null;
      }
      if (morphAttributes[name] === void 0) morphAttributes[name] = [];
      morphAttributes[name].push(geometry.morphAttributes[name]);
    }
    if (useGroups) {
      let count;
      if (isIndexed) {
        count = geometry.index.count;
      } else if (geometry.attributes.position !== void 0) {
        count = geometry.attributes.position.count;
      } else {
        console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " + i + ". The geometry must have either an index or a position attribute");
        return null;
      }
      mergedGeometry.addGroup(offset, count, i);
      offset += count;
    }
  }
  if (isIndexed) {
    let indexOffset = 0;
    const mergedIndex = [];
    for (let i = 0; i < geometries.length; ++i) {
      const index = geometries[i].index;
      for (let j = 0; j < index.count; ++j) {
        mergedIndex.push(index.getX(j) + indexOffset);
      }
      indexOffset += geometries[i].attributes.position.count;
    }
    mergedGeometry.setIndex(mergedIndex);
  }
  for (const name in attributes) {
    const mergedAttribute = mergeAttributes(attributes[name]);
    if (!mergedAttribute) {
      console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the " + name + " attribute.");
      return null;
    }
    mergedGeometry.setAttribute(name, mergedAttribute);
  }
  for (const name in morphAttributes) {
    const numMorphTargets = morphAttributes[name][0].length;
    if (numMorphTargets === 0) break;
    mergedGeometry.morphAttributes = mergedGeometry.morphAttributes || {};
    mergedGeometry.morphAttributes[name] = [];
    for (let i = 0; i < numMorphTargets; ++i) {
      const morphAttributesToMerge = [];
      for (let j = 0; j < morphAttributes[name].length; ++j) {
        morphAttributesToMerge.push(morphAttributes[name][j][i]);
      }
      const mergedMorphAttribute = mergeAttributes(morphAttributesToMerge);
      if (!mergedMorphAttribute) {
        console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the " + name + " morphAttribute.");
        return null;
      }
      mergedGeometry.morphAttributes[name].push(mergedMorphAttribute);
    }
  }
  return mergedGeometry;
}
function mergeAttributes(attributes) {
  let TypedArray;
  let itemSize;
  let normalized;
  let gpuType = -1;
  let arrayLength = 0;
  for (let i = 0; i < attributes.length; ++i) {
    const attribute = attributes[i];
    if (attribute.isInterleavedBufferAttribute) {
      console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. InterleavedBufferAttributes are not supported.");
      return null;
    }
    if (TypedArray === void 0) TypedArray = attribute.array.constructor;
    if (TypedArray !== attribute.array.constructor) {
      console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.array must be of consistent array types across matching attributes.");
      return null;
    }
    if (itemSize === void 0) itemSize = attribute.itemSize;
    if (itemSize !== attribute.itemSize) {
      console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.itemSize must be consistent across matching attributes.");
      return null;
    }
    if (normalized === void 0) normalized = attribute.normalized;
    if (normalized !== attribute.normalized) {
      console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.normalized must be consistent across matching attributes.");
      return null;
    }
    if (gpuType === -1) gpuType = attribute.gpuType;
    if (gpuType !== attribute.gpuType) {
      console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.gpuType must be consistent across matching attributes.");
      return null;
    }
    arrayLength += attribute.array.length;
  }
  const array = new TypedArray(arrayLength);
  let offset = 0;
  for (let i = 0; i < attributes.length; ++i) {
    array.set(attributes[i].array, offset);
    offset += attributes[i].array.length;
  }
  const result = new BufferAttribute(array, itemSize, normalized);
  if (gpuType !== void 0) {
    result.gpuType = gpuType;
  }
  return result;
}

// JET/015 runtime: airframe.js
import * as T2 from "three/webgpu";

// JET/015 runtime: helpers.js
import * as T from "three/webgpu";
function mesh(geo, mat) {
  const o = new T.Mesh(geo, mat);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}
function loft(sections, material2, { steps = 32, start = 0, end = Math.PI * 2, caps = true } = {}) {
  const positions = [], indices = [], full = end - start > Math.PI * 2 - 1e-3;
  if (sections.length > 3) {
    const original = sections, curve = new T.CatmullRomCurve3(sections.map(([z, w, h]) => new T.Vector3(w, h, z)), false, "centripetal");
    sections = Array.from({ length: Math.max(24, sections.length * 4) }, (_, i) => {
      const t = i / (Math.max(24, original.length * 4) - 1), v = curve.getPoint(t), j = t * (original.length - 1), a = Math.floor(j), b = Math.min(original.length - 1, a + 1);
      return [v.z, Math.max(5e-3, v.x), Math.max(5e-3, v.y), T.MathUtils.lerp(original[a][3], original[b][3], j - a)];
    });
  }
  for (const [z, w, h, y] of sections) for (let i = 0; i <= steps; i++) {
    const a = start + (end - start) * i / steps;
    positions.push(Math.cos(a) * w, y + Math.sin(a) * h, z);
  }
  for (let j = 0; j < sections.length - 1; j++) for (let i = 0; i < steps; i++) {
    const a = j * (steps + 1) + i, b = a + steps + 1;
    indices.push(a, a + 1, b, b, a + 1, b + 1);
  }
  if (caps && full) {
    for (const j of [0, sections.length - 1]) {
      const [z, w, h, y] = sections[j], idx = positions.length / 3;
      positions.push(0, y, z);
      for (let i = 0; i < steps; i++) {
        const a = j * (steps + 1) + i;
        if (j === 0) indices.push(idx, a + 1, a);
        else indices.push(idx, a, a + 1);
      }
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return mesh(g, material2);
}
function tube(points, r, material2, segments = 24, radial = 6) {
  return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p))), segments, r, radial, false), material2);
}
function cyl(radius, length, material2, pos = [0, 0, 0], segments = 24) {
  const o = mesh(new T.CylinderGeometry(radius, radius, length, segments), material2);
  o.rotation.x = Math.PI / 2;
  o.position.set(...pos);
  return o;
}
function box(size, pos, material2) {
  const [w, h, d] = size, r = Math.min(w, h, d) * 0.12;
  const sh = new T.Shape();
  sh.moveTo(-w / 2 + r, -h / 2);
  sh.lineTo(w / 2 - r, -h / 2);
  sh.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  sh.lineTo(w / 2, h / 2 - r);
  sh.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  sh.lineTo(-w / 2 + r, h / 2);
  sh.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  sh.lineTo(-w / 2, -h / 2 + r);
  sh.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const g = new T.ExtrudeGeometry(sh, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r * 0.5, bevelSegments: 1, steps: 1, curveSegments: 2 });
  g.translate(0, 0, -d / 2 + r);
  const o = mesh(g, material2);
  o.position.set(...pos);
  return o;
}
function ring(radius, tubeRadius, material2, pos = [0, 0, 0]) {
  const o = mesh(new T.TorusGeometry(radius, tubeRadius, 6, 32), material2);
  o.position.set(...pos);
  return o;
}
function seam(points, material2, width = 7e-3) {
  return tube(points, width, material2, Math.max(points.length * 4, 20), 5);
}
function ovalRing(z, w, h, cy, material2, r = 8e-3) {
  return tube(Array.from({ length: 65 }, (_, i) => [Math.cos(i * Math.PI / 32) * w, cy + Math.sin(i * Math.PI / 32) * h, z]), r, material2, 48, 4);
}
function fasteners(points, material2, r = 0.013) {
  const g = new T.SphereGeometry(r, 8, 5), o = new T.InstancedMesh(g, material2, points.length), m = new T.Matrix4();
  points.forEach((p, i) => {
    m.makeTranslation(...p);
    o.setMatrixAt(i, m);
  });
  return o;
}

// JET/015 runtime: airframe.js
function buildAirframe({ add, mat }) {
  let o = loft([[-7.55, 0.012, 0.018, 0.12], [-7.4, 0.09, 0.09, 0.12], [-7.15, 0.2, 0.18, 0.12], [-6.8, 0.34, 0.28, 0.12], [-6.4, 0.46, 0.38, 0.12], [-5.95, 0.54, 0.45, 0.12], [-5.5, 0.59, 0.5, 0.12]], mat.radome);
  add("AF-01", "Ogive radar radome", "Airframe", o, [0, 0, -3.3], "Smooth ogive composite radome with a structural aft attachment ring.");
  const collar = new T2.Group();
  collar.add(loft([[-5.53, 0.596, 0.506, 0.12], [-5.43, 0.604, 0.513, 0.12]], mat.orange));
  collar.add(ovalRing(-5.53, 0.598, 0.508, 0.12, mat.dark, 8e-3));
  collar.add(ovalRing(-5.43, 0.606, 0.515, 0.12, mat.dark, 6e-3));
  collar.add(fasteners(Array.from({ length: 18 }, (_, i) => {
    const a = i * Math.PI / 9;
    return [0.608 * Math.cos(a), 0.12 + 0.518 * Math.sin(a), -5.47];
  }), mat.metal, 9e-3));
  add("AF-02", "Radome retaining collar", "Airframe", collar, [0, 0, -1.8], "Circumferential collar and restrained attachment fasteners.");
  const front = new T2.Group();
  front.add(loft([[-5.43, 0.6, 0.51, 0.12], [-5.15, 0.65, 0.54, 0.12], [-4.85, 0.69, 0.56, 0.12]], mat.skin));
  front.add(loft([[-4.85, 0.69, 0.56, 0.12], [-4.4, 0.74, 0.59, 0.12], [-3.8, 0.79, 0.61, 0.12], [-3, 0.83, 0.63, 0.12], [-2.2, 0.85, 0.65, 0.12], [-1.6, 0.84, 0.63, 0.12]], mat.skin, { start: 2.42, end: Math.PI * 2 + 0.72, steps: 64, caps: false }));
  for (const side of [-1, 1]) {
    front.add(seam([[side * 0.43, -0.04, -6], [side * 0.58, -0.07, -5.3], [side * 0.69, -0.09, -4.7], [side * 0.79, -0.11, -3.4], [side * 0.82, -0.11, -2.1]], mat.seam, 5e-3));
    front.add(seam([[side * 0.67, 0.37, -4.8], [side * 0.72, 0.41, -4.2], [side * 0.78, 0.42, -3], [side * 0.79, 0.41, -2]], mat.secondary, 0.018));
    const panelPts = [[side * 0.79, 0, -3.9], [side * 0.81, 0.27, -3.85], [side * 0.85, 0.27, -2.9], [side * 0.83, 0, -2.88], [side * 0.79, 0, -3.9]];
    front.add(seam(panelPts, mat.seam, 4e-3));
    front.add(fasteners(panelPts.slice(0, 4), mat.metal, 9e-3));
  }
  add("AF-03", "Forward fuselage / cockpit sill", "Airframe", front, [0, 0.5, -0.7], "Open upper cockpit bay, continuous side shells, sill rails and flush service panels.");
  const center = new T2.Group();
  center.add(loft([[-1.63, 0.84, 0.63, 0.12], [-1, 0.9, 0.61, 0.12], [0, 0.98, 0.58, 0.12], [1, 0.96, 0.55, 0.12], [2, 0.88, 0.52, 0.12], [3, 0.76, 0.48, 0.12], [3.8, 0.63, 0.43, 0.12], [4.5, 0.48, 0.34, 0.12], [5.2, 0.29, 0.25, 0.12], [5.75, 0.1, 0.14, 0.12]], mat.skin));
  for (const z of [-1.2, 0.5, 2.25, 3.75]) {
    const w = z < 0 ? 0.89 : z < 1 ? 0.97 : z < 3 ? 0.85 : 0.64, h = z < 0 ? 0.62 : z < 1 ? 0.56 : z < 3 ? 0.5 : 0.43;
    center.add(ovalRing(z, w + 2e-3, h + 2e-3, 0.12, mat.seam, 4e-3));
  }
  for (const side of [-1, 1]) {
    center.add(seam([[side * 0.4, 0.67, -1.2], [side * 0.46, 0.64, 0], [side * 0.44, 0.59, 1.7], [side * 0.32, 0.54, 3.2]], mat.seam, 5e-3));
    const hatch = box([0.23, 0.016, 0.6], [side * 0.4, 0.65, 0.2], mat.secondary);
    hatch.rotation.z = side * 0.18;
    center.add(hatch);
    center.add(fasteners([[-0.085, -0.085], [0.085, -0.085], [-0.085, 0.085], [0.085, 0.085]].map(([x, z]) => [side * 0.4 + x, 0.668, 0.2 + z * 2.5]), mat.metal, 9e-3));
  }
  add("AF-04", "Aft fuselage shell", "Airframe", center, [0, 0, 0], "Tapered central load-bearing shell and dorsal access hatches.");
  const spine = new T2.Group();
  spine.add(loft([[-1.65, 0.14, 0.18, 0.68], [-1.25, 0.24, 0.22, 0.68], [0, 0.25, 0.2, 0.64], [1.7, 0.2, 0.17, 0.59], [3.3, 0.13, 0.13, 0.53], [4.4, 0.04, 0.07, 0.42]], mat.secondary, { steps: 40 }));
  add("AF-05", "Dorsal avionics fairing", "Airframe", spine, [0, 2.2, 1], "Low continuous fairing linking cockpit and tail structure.");
  for (const side of [-1, 1]) {
    const rows = [[-1.25, 0.8, 0.62, 0.48], [-0.75, 1.2, 0.66, 0.43], [0, 1.72, 0.66, 0.13], [1.3, 1.93, 0.61, 0.075], [2.5, 1.96, 0.54, 0.065], [3.45, 1.48, 0.48, 0.13], [3.8, 0.77, 0.4, 0.3]], pp = [], ii = [], N = 20;
    for (const [z, x, inner, outer] of rows) for (let j = 0; j <= N; j++) {
      const t = j / N;
      pp.push(side * (0.48 + (x - 0.48) * t), inner - (inner - outer) * t * t, z);
    }
    for (let k = 0; k < rows.length - 1; k++) for (let j = 0; j < N; j++) {
      const a = k * (N + 1) + j, b = a + N + 1;
      ii.push(a, a + 1, b, a + 1, b + 1, b);
    }
    const geo = new T2.BufferGeometry();
    geo.setAttribute("position", new T2.Float32BufferAttribute(pp, 3));
    geo.setIndex(side > 0 ? ii : ii.reduce((a, v, i) => {
      if (i % 3 === 0) a.push(ii[i], ii[i + 2], ii[i + 1]);
      return a;
    }, []));
    geo.computeVertexNormals();
    const fair = mesh(geo, mat.skin.clone());
    fair.material.side = T2.DoubleSide;
    add(side < 0 ? "AF-P7" : "AF-S7", (side < 0 ? "Port" : "Starboard") + " blended nacelle / wing shoulder", "Airframe", fair, [side * 1.7, 1.4, 0.2], "Continuous upper root fillet joins the central body, nacelle shoulder and wing skin.");
  }
  const belly = new T2.Group();
  belly.add(loft([[-2.4, 0.22, 0.05, -0.47], [-1.6, 0.4, 0.09, -0.48], [0, 0.5, 0.1, -0.45], [1.8, 0.38, 0.08, -0.41], [2.6, 0.15, 0.03, -0.36]], mat.secondary, { steps: 32 }));
  for (const z of [-1.7, -0.7, 0.4, 1.5]) belly.add(seam([[-0.28, -0.53, z], [0, -0.58, z], [0.28, -0.53, z]], mat.seam, 5e-3));
  add("AF-06", "Ventral service spine", "Airframe", belly, [0, -2.2, 0], "Shallow underside fairing and panel breaks; no invented machinery.");
}
function airfoil(stations, material2, u0 = 0, u1 = 1) {
  const pp = [], idx = [], N = 24;
  for (const st of stations) {
    const [x, l, t, y, h] = st;
    for (let k = 0; k <= N * 2; k++) {
      const top = k <= N, u = k <= N ? k / N : (2 * N - k) / N, q = u0 + (u1 - u0) * u;
      const thick = 5 * h * (0.2969 * Math.sqrt(Math.max(q, 0)) - 0.126 * q - 0.3516 * q * q + 0.2843 * q * q * q - 0.1036 * q * q * q * q);
      pp.push(x, y + (top ? thick : -thick), l + (t - l) * q);
    }
  }
  const stride = N * 2 + 1;
  for (let j = 0; j < stations.length - 1; j++) for (let k = 0; k < stride - 1; k++) {
    const a = j * stride + k, b = a + stride;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  for (const j of [0, stations.length - 1]) {
    const c = pp.length / 3, st = stations[j];
    pp.push(st[0], st[3], st[1] + (st[2] - st[1]) * (u0 + u1) / 2);
    for (let k = 0; k < stride - 1; k++) {
      const a = j * stride + k;
      if (j === 0) idx.push(c, a + 1, a);
      else idx.push(c, a, a + 1);
    }
  }
  const g = new T2.BufferGeometry();
  g.setAttribute("position", new T2.Float32BufferAttribute(pp, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const o = mesh(g, material2);
  o.material = material2.clone();
  o.material.side = T2.DoubleSide;
  return o;
}
function buildWings({ add, mat }) {
  for (const side of [-1, 1]) {
    const name = side < 0 ? "Port" : "Starboard", pre = side < 0 ? "P" : "S";
    const stations = [[side * 0.78, -0.5, 3.25, -0.035, 0.22], [side * 1.65, -0.12, 3.22, 0, 0.18], [side * 3.4, 0.84, 3.14, 0.1, 0.105], [side * 5.5, 1.96, 3.05, 0.25, 0.045]];
    const wing = new T2.Group();
    wing.add(airfoil(stations, mat.wing, 0, 0.755));
    for (const [x, z1, z2, y] of [[1.7, 0.22, 2.15, 0.09], [3.1, 1, 2.38, 0.14], [4.45, 1.7, 2.53, 0.24]]) wing.add(seam([[side * x, y, z1], [side * x, y + 0.012, z2]], mat.seam, 4e-3));
    wing.add(seam([[side * 1.1, 0.09, 0.15], [side * 2.1, 0.13, 0.6], [side * 3.8, 0.2, 1.47], [side * 5.25, 0.29, 2.18]], mat.seam, 4e-3));
    add(`WNG-${pre}1`, `${name} main wing structure`, "Wings", wing, [side * 4.3, 0.5, 0], "Swept tapered airfoil with thickness, root blending and spanwise panel structure.");
    const flapStations = stations.slice(0, 3).map((s) => [...s]);
    flapStations[2][0] = side * 3.28;
    add(`WNG-${pre}2`, `${name} inboard flap`, "Wings", airfoil(flapStations, mat.secondary, 0.77, 0.99), [side * 4.3, -1.3, 1.5], "Separate thick trailing-edge flap with a visible hinge gap.");
    add(`WNG-${pre}3`, `${name} outboard aileron`, "Wings", airfoil([stations[2].map((n, i) => i === 0 ? n + side * 0.045 : n), stations[3]], mat.skin, 0.77, 1), [side * 5.3, 0.8, 1.3], "Outboard control surface with consistent root-tip airfoil transition.");
    const cap = new T2.Group();
    cap.add(airfoil([[side * 5.48, 1.96, 3.05, 0.25, 0.048], [side * 5.59, 2.02, 3, 0.25, 0.025]], mat.dark));
    const nav = mesh(new T2.SphereGeometry(0.035, 12, 8), side < 0 ? mat.red : mat.green);
    nav.position.set(side * 5.57, 0.27, 2.5);
    cap.add(nav);
    add(`WNG-${pre}4`, `${name} tip cap and nav light`, "Wings", cap, [side * 6, 0.5, 0.2], "Protective wingtip cap and small navigation light.");
    const stab = [[side * 0.55, 3.95, 5.7, 0.35, 0.13], [side * 1.4, 4.3, 5.95, 0.43, 0.09], [side * 2.7, 5.05, 6.2, 0.52, 0.035]];
    add(`WNG-${pre}5`, `${name} horizontal stabilizer`, "Empennage", airfoil(stab, mat.wing, 0, 0.76), [side * 3.4, 1.7, 2], "Swept tailplane with a tapered section.");
    add(`WNG-${pre}6`, `${name} elevator`, "Empennage", airfoil(stab, mat.secondary, 0.78, 1), [side * 3.4, 0.8, 3], "Independent tailplane trailing-edge control surface.");
  }
  const finStations = [[0, 3, 5.85, 0, 0.19], [1, 3.65, 5.9, 0, 0.13], [2.35, 4.65, 5.95, 0, 0.045]];
  const fin = airfoil(finStations, mat.skin, 0, 0.76);
  fin.rotation.z = Math.PI / 2;
  fin.position.y = 0.46;
  add("WNG-V1", "Vertical stabilizer", "Empennage", fin, [0, 3.1, 2], "Swept vertical airfoil with a narrow leading edge.");
  const rudder = airfoil(finStations, mat.secondary, 0.78, 1);
  rudder.rotation.z = Math.PI / 2;
  rudder.position.y = 0.46;
  add("WNG-V2", "Rudder", "Empennage", rudder, [0, 3.1, 3.5], "Separate trailing rudder and continuous hinge gap.");
  const marker = box([0.15, 0.12, 0.015], [0, 2.55, 5.45], mat.orange);
  add("WNG-V3", "Tail identification cap", "Empennage", marker, [0, 4, 2.5], "Small amber identification accent.");
}

// JET/015 runtime: engines.js
import * as T3 from "three/webgpu";
function revolve(profile, material2, arc = Math.PI * 2, start = 0) {
  const g = new T3.LatheGeometry(profile.map(([z, r]) => new T3.Vector2(r, z)), 40, start, arc);
  g.rotateX(Math.PI / 2);
  return mesh(g, material2);
}
function buildEngines({ add, mat }) {
  for (const s of [-1, 1]) {
    const name = s < 0 ? "Port" : "Starboard", prefix = s < 0 ? "ENG-P" : "ENG-S", x = s * 1.12, y = -0.08;
    const register = (id, n, o, offset, desc) => {
      const group = new T3.Group();
      group.position.set(x, y, 0);
      group.add(o);
      add(prefix + id, name + " " + n, "Propulsion", group, [s * offset[0], offset[1], offset[2]], desc);
    };
    const lip = new T3.Group();
    lip.add(revolve([[-0.65, 0.58], [-1.12, 0.63], [-1.38, 0.645], [-1.5, 0.62], [-1.54, 0.59], [-1.5, 0.55], [-1.35, 0.525], [-0.68, 0.49]], mat.secondary));
    lip.add(revolve([[-1.4, 0.643], [-1.5, 0.62], [-1.54, 0.59], [-1.5, 0.55], [-1.43, 0.535]], mat.metal));
    lip.add(ring(0.635, 7e-3, mat.seam, [0, 0, -1.24]));
    register("1", "intake lip and duct", lip, [3.4, -0.2, -1.5], "Rounded intake lip with an actual open throat and converging duct.");
    const duct = revolve([[-1.35, 0.524], [-0.8, 0.49], [-0.1, 0.45], [0.12, 0.45], [0.12, 0.47], [-0.8, 0.51], [-1.35, 0.54]], mat.dark);
    register("2", "intake liner", duct, [3.4, -1.4, -0.6], "Dark recessed liner gives the intake real depth.");
    const fan = new T3.Group();
    const hub = revolve([[-0.4, 0], [-0.36, 0.045], [-0.27, 0.1], [-0.12, 0.14], [0.12, 0.16], [0.3, 0.16]], mat.metal);
    fan.add(hub);
    for (let i = 0; i < 24; i++) {
      const a = i * Math.PI / 12, pp = [];
      for (const [r, twist, z] of [[0.15, 0.01, 0.08], [0.28, 0.12, -0.01], [0.44, 0.22, -0.045], [0.45, 0.02, 0.02], [0.28, -0.06, 0.11], [0.15, -0.12, 0.15]]) pp.push(r * Math.cos(a + twist), r * Math.sin(a + twist), z);
      const g = new T3.BufferGeometry();
      g.setAttribute("position", new T3.Float32BufferAttribute(pp, 3));
      g.setIndex([0, 1, 5, 1, 4, 5, 1, 2, 4, 2, 3, 4]);
      g.computeVertexNormals();
      const blade = mesh(g, mat.fan);
      fan.add(blade);
    }
    fan.add(ring(0.448, 0.012, mat.metal, [0, 0, 0.08]));
    register("3", "fan face and spinner", fan, [3.6, -2.55, -0.4], "Swept radial fan blades and a smooth central spinner, visible through the duct.");
    for (const [idx, label, start] of [["4", "upper removable cowling", Math.PI / 2], ["5", "lower removable cowling", Math.PI * 1.5]]) {
      const cow = new T3.Group();
      cow.add(revolve([[-0.78, 0.585], [-0.15, 0.62], [0.8, 0.645], [2.1, 0.638], [3.3, 0.61], [4.2, 0.55], [4.35, 0.53], [4.35, 0.505], [3.3, 0.585], [2.1, 0.613], [0.8, 0.62], [-0.15, 0.595], [-0.78, 0.56]], mat.secondary, Math.PI - 0.012, start + 6e-3));
      for (const z of [0.2, 1.9, 3.4]) {
        const rr = z < 1 ? 0.637 : z < 3 ? 0.642 : 0.607;
        const arc = new T3.Curve();
        arc.getPoint = (t) => {
          const a = start + 0.02 + t * (Math.PI - 0.04);
          return new T3.Vector3(Math.sin(a) * rr, -Math.cos(a) * rr, z);
        };
        cow.add(mesh(new T3.TubeGeometry(arc, 24, 4e-3, 4, false), mat.seam));
        cow.add(fasteners(Array.from({ length: 9 }, (_, i) => {
          const a = start + 0.16 + i * (Math.PI - 0.32) / 8;
          return [Math.sin(a) * (rr + 2e-3), -Math.cos(a) * (rr + 2e-3), z + 0.025];
        }), mat.metal, 8e-3));
      }
      register(idx, label, cow, [4, label.startsWith("upper") ? 1.2 : -2.1, 1.2], "Thin-walled longitudinal nacelle half-shell with restrained circumferential service seams.");
    }
    const core = new T3.Group();
    core.add(revolve([[0.1, 0.4], [0.4, 0.43], [1.4, 0.44], [2.5, 0.39], [3.2, 0.35], [4.1, 0.36], [4.45, 0.38]], mat.engine));
    for (const z of [0.45, 1.5, 2.6, 3.7]) core.add(ring(z < 2 ? 0.445 : 0.39, 0.018, mat.metal, [0, 0, z]));
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      const rail = cyl(0.012, 2, mat.metal, [0.43 * Math.cos(a), 0.43 * Math.sin(a), 1.5], 8);
      core.add(rail);
    }
    register("6", "engine core casing", core, [4, -0.4, 2], "A simplified external engine-core envelope and retention bands; not a working engine schematic.");
    const nozzle = new T3.Group();
    nozzle.add(revolve([[4.15, 0.54], [4.35, 0.54], [4.65, 0.505], [4.9, 0.485], [4.9, 0.46], [4.3, 0.5]], mat.metal));
    nozzle.add(ring(0.533, 0.018, mat.engine, [0, 0, 4.32]));
    nozzle.add(ring(0.505, 0.014, mat.metal, [0, 0, 4.65]));
    const N = 18;
    for (let i = 0; i < N; i++) {
      const a = i * Math.PI * 2 / N, half = Math.PI / N * 0.91, pp = [];
      for (const [z, r] of [[4.55, 0.51], [5.13, 0.46], [5.68, 0.395]]) for (const angle of [a - half, a + half]) pp.push(Math.cos(angle) * r, Math.sin(angle) * r, z);
      const outer = pp.length / 3;
      for (let q = 0; q < outer; q++) {
        const vx = pp[q * 3], vy = pp[q * 3 + 1], vz = pp[q * 3 + 2], rr = Math.hypot(vx, vy);
        pp.push(vx * (rr - 0.012) / rr, vy * (rr - 0.012) / rr, vz);
      }
      const g = new T3.BufferGeometry();
      g.setAttribute("position", new T3.Float32BufferAttribute(pp, 3));
      g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4, 6, 8, 7, 7, 8, 9, 8, 10, 9, 9, 10, 11, 0, 6, 1, 1, 6, 7, 4, 5, 10, 5, 11, 10, 0, 2, 6, 2, 8, 6, 2, 4, 8, 4, 10, 8, 1, 7, 3, 3, 7, 9, 3, 9, 5, 5, 9, 11]);
      g.computeVertexNormals();
      nozzle.add(mesh(g, i % 3 === 0 ? mat.heat : mat.nozzle));
      const actu = cyl(0.019, 0.46, mat.engine, [Math.cos(a) * 0.53, Math.sin(a) * 0.53, 4.64], 8);
      nozzle.add(actu);
    }
    nozzle.add(revolve([[4.65, 0.39], [5.35, 0.35], [5.66, 0.377], [5.66, 0.385], [5.35, 0.365], [4.65, 0.41]], mat.bore));
    register("7", "variable exhaust nozzle", nozzle, [4, -0.4, 4.3], "Layered nozzle petals, actuation rods, retaining rings and recessed throat.");
    const hot = new T3.Group();
    hot.add(cyl(0.35, 0.018, mat.dark, [0, 0, 4.26]));
    for (let i = 0; i < 12; i++) {
      const b = cyl(9e-3, 0.68, mat.heat, [0, 0, 4.32], 6);
      b.rotation.x = 0;
      b.rotation.z = i * Math.PI / 6;
      hot.add(b);
    }
    hot.add(ring(0.27, 0.017, mat.heat, [0, 0, 4.34]));
    register("8", "recessed exhaust baffle", hot, [4, -1.5, 3.7], "Restrained depth cue at the rear of the core; no emissive fake flame.");
  }
}

// JET/015 runtime: cockpit.js
import * as T4 from "three/webgpu";
function strap(points, width, material2) {
  const pp = [], idx = [];
  points.forEach(([x, y, z], i) => {
    pp.push(x - width / 2, y, z, x + width / 2, y, z);
    if (i) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const geo = new T4.BufferGeometry();
  geo.setAttribute("position", new T4.Float32BufferAttribute(pp, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const o = mesh(geo, material2.clone());
  o.material.side = T4.DoubleSide;
  return o;
}
function buildCockpit({ add, mat }) {
  const tub = new T4.Group();
  tub.add(box([1.13, 0.1, 2.8], [0, 0.18, -3.12], mat.dark));
  for (const s of [-1, 1]) {
    tub.add(box([0.12, 0.37, 2.65], [s * 0.52, 0.4, -3.12], mat.dark));
    tub.add(box([0.18, 0.065, 2.65], [s * 0.52, 0.62, -3.12], mat.secondary));
    tub.add(tube([[s * 0.5, 0.68, -4.52], [s * 0.58, 0.72, -3.9], [s * 0.6, 0.74, -2.6], [s * 0.49, 0.67, -1.78]], 0.026, mat.metal));
  }
  add("CKP-01", "Cockpit tub and sill rails", "Cockpit", tub, [0, 2.9, -0.6], "Recessed cockpit tub, side consoles and structural canopy sealing rails.");
  const seat = new T4.Group();
  seat.add(box([0.65, 0.13, 0.61], [0, 0.43, -2.55], mat.rubber));
  const back = box([0.64, 0.93, 0.14], [0, 0.92, -2.23], mat.rubber);
  back.rotation.x = -0.12;
  seat.add(back);
  seat.add(box([0.4, 0.29, 0.18], [0, 1.5, -2.14], mat.rubber));
  for (const s of [-1, 1]) {
    seat.add(box([0.065, 1.08, 0.12], [s * 0.34, 0.94, -2.15], mat.metal));
    seat.add(strap([[s * 0.2, 1.45, -2.24], [s * 0.19, 1.22, -2.33], [s * 0.14, 0.8, -2.4], [s * 0.06, 0.5, -2.55]], 0.065, mat.harness));
    seat.add(strap([[s * 0.34, 0.53, -2.34], [s * 0.26, 0.52, -2.58], [s * 0.07, 0.53, -2.65]], 0.065, mat.harness));
  }
  seat.add(box([0.12, 0.045, 0.08], [0, 0.55, -2.65], mat.metal));
  const pull = mesh(new T4.TorusGeometry(0.09, 0.016, 8, 24), mat.orange);
  pull.rotation.x = Math.PI / 2;
  pull.scale.set(1, 0.7, 1);
  pull.position.set(0, 0.56, -2.91);
  seat.add(pull);
  seat.position.y = -0.25;
  add("CKP-02", "Seat and harness assembly", "Cockpit", seat, [0, 5.4, 0.2], "Seat cushions, structural rails, shoulder/lap harness and visible buckle. Fictional seat, not certified hardware.");
  const panel = new T4.Group();
  const board = box([1.02, 0.48, 0.13], [0, 0.89, -3.92], mat.dark);
  board.rotation.x = -0.2;
  panel.add(board);
  for (const s of [-1, 1]) {
    panel.add(box([0.36, 0.27, 0.035], [s * 0.25, 0.92, -3.83], mat.metal));
    panel.add(box([0.305, 0.215, 0.041], [s * 0.25, 0.92, -3.807], mat.screen));
    const display = mesh(new T4.PlaneGeometry(0.295, 0.205), s < 0 ? mat.screenFlight : mat.screenNav);
    display.position.set(s * 0.25, 0.92, -3.784);
    panel.add(display);
    for (let i = 0; i < 5; i++) {
      panel.add(box([0.025, 0.025, 0.025], [s * 0.25 - 0.12 + i * 0.06, 0.765, -3.79], mat.secondary));
    }
    for (let i = 0; i < 3; i++) panel.add(box([0.026, 0.026, 0.025], [s * 0.25 + 0.19, 0.85 + i * 0.065, -3.79], mat.secondary));
  }
  panel.add(box([0.9, 0.07, 0.26], [0, 1.17, -3.95], mat.dark));
  for (const s of [-1, 1]) {
    const hood = box([0.045, 0.26, 0.25], [s * 0.48, 1.03, -3.96], mat.dark);
    panel.add(hood);
  }
  panel.position.y = -0.13;
  add("CKP-03", "Instrument panel and displays", "Cockpit", panel, [0, 4.5, -2.4], "Recessed display bezels, physical switch controls and glare shield.");
  const controls = new T4.Group();
  controls.add(tube([[0, 0.3, -3.16], [0, 0.52, -3.12], [0, 0.68, -3.18]], 0.035, mat.dark));
  const grip = box([0.09, 0.16, 0.1], [0, 0.74, -3.17], mat.rubber);
  grip.rotation.x = -0.2;
  controls.add(grip);
  controls.add(box([0.025, 0.025, 0.015], [0.035, 0.8, -3.225], mat.orange));
  for (const s of [-1, 1]) {
    const pedal = box([0.19, 0.16, 0.04], [s * 0.22, 0.39, -3.65], mat.metal);
    pedal.rotation.x = -0.32;
    controls.add(pedal);
    for (let j = 0; j < 4; j++) controls.add(box([0.04, 0.03, 0.06], [s * 0.49, 0.68, -3.58 + j * 0.21], mat.dark));
  }
  add("CKP-04", "Pilot controls and pedals", "Cockpit", controls, [0, 3.4, -2.4], "Control stick, rudder pedals, throttle and console switches.");
  const sections = [[-4.82, 0.02, 0.01, 0.7], [-4.65, 0.24, 0.24, 0.71], [-4.35, 0.43, 0.52, 0.72], [-3.95, 0.56, 0.74, 0.73], [-3.35, 0.6, 0.86, 0.73], [-2.7, 0.58, 0.9, 0.72], [-2.05, 0.48, 0.76, 0.69], [-1.65, 0.25, 0.4, 0.65], [-1.51, 0.03, 0.03, 0.63]];
  const glass = loft(sections, mat.glass, { steps: 24, start: 0, end: Math.PI, caps: false });
  add("CKP-05", "Canopy glazing", "Cockpit", glass, [0, 7.3, -0.4], "Continuous smooth transparent canopy surface with controlled tint and real cockpit visibility.");
  const frame = new T4.Group();
  for (const s of [-1, 1]) frame.add(tube(sections.map(([z, w, h, y]) => [s * w, y, z]), 0.028, mat.skin, 40, 6));
  for (const zidx of [2, 6]) {
    const [z, w, h, y] = sections[zidx];
    frame.add(tube(Array.from({ length: 33 }, (_, i) => [Math.cos(i * Math.PI / 32) * w, y + Math.sin(i * Math.PI / 32) * h, z]), 0.027, mat.secondary, 32, 6));
  }
  for (const s of [-1, 1]) {
    frame.add(cyl(0.06, 0.16, mat.metal, [s * 0.24, 0.66, -1.64], 16));
    frame.add(fasteners([[-4.2, 0.48], [-3.3, 0.6], [-2.3, 0.52]].map(([z, x]) => [s * x, 0.72, z]), mat.metal, 0.01));
  }
  add("CKP-06", "Canopy frame and hinges", "Cockpit", frame, [0, 6.3, -0.3], "Slim canopy bows, sealing frame and aft hinge lugs.");
}

// JET/015 runtime: weapons.js
import * as T5 from "three/webgpu";
function buildWeapons({ add, mat }) {
  for (const s of [-1, 1]) {
    let reg = function(id, label, o, off, desc) {
      const g = new T5.Group();
      g.position.set(x, y, 0);
      g.add(o);
      add(pre + id, n + " " + label, "Gun pods", g, [s * off[0], off[1], off[2]], desc);
    };
    const n = s < 0 ? "Port" : "Starboard", pre = s < 0 ? "WPN-P" : "WPN-S", x = s * 1.65, y = -0.7;
    const shell = new T5.Group();
    shell.add(loft([[-3.05, 0.08, 0.1, 0], [-2.85, 0.2, 0.2, 0], [-2.4, 0.25, 0.25, 0], [-1.6, 0.26, 0.25, 0], [-0.75, 0.23, 0.22, 0], [-0.1, 0.09, 0.11, 0], [0.1, 0.015, 0.02, 0]], mat.secondary));
    shell.add(box([0.2, 0.33, 0.85], [0, 0.22, -1.1], mat.dark));
    for (const z of [-2.4, -1.45, -0.65]) shell.add(ring(0.247, 4e-3, mat.seam, [0, 0, z]));
    reg("1", "integrated gun-pod fairing", shell, [2.6, -2, -1], "Streamlined underslung fairing with an integral pylon and recessed muzzle.");
    const barrel = new T5.Group();
    barrel.add(cyl(0.085, 0.9, mat.engine, [0, 0, -3.05], 32));
    barrel.add(cyl(0.1, 0.2, mat.metal, [0, 0, -3.45], 32));
    barrel.add(cyl(0.062, 7e-3, mat.dark, [0, 0, -3.558], 32));
    barrel.add(ring(0.082, 0.01, mat.metal, [0, 0, -3.55]));
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      const b = box([8e-3, 0.025, 0.08], [Math.cos(a) * 0.101, Math.sin(a) * 0.101, -3.46], mat.dark);
      b.rotation.z = a;
      barrel.add(b);
    }
    reg("2", "barrel and muzzle collar", barrel, [2.6, -2.2, -2.8], "Machined muzzle collar, dark bore and limited cooling apertures. Fictional visual assembly only.");
  }
}

// JET/015 runtime: runtime.js
var material = (c, m = 0.3, r = 0.48) => new T6.MeshStandardMaterial({ color: c, metalness: m, roughness: r });
function buildJetHeroUncached() {
  const root = new T6.Group();
  root.name = "JET / 015";
  const scale = new T6.Matrix4().makeScale(9 / 11, 0.65, 0.66);
  scale.setPosition(0, 0, -0.1);
  const mat = { bore: new T6.MeshBasicMaterial({ color: "#10181d", side: T6.DoubleSide }), skin: material("#788487", 0.38, 0.44), secondary: material("#64767c", 0.4, 0.48), wing: material("#939486", 0.3, 0.51), dark: material("#141e26", 0.3, 0.56), radome: material("#394d56", 0.15, 0.56), metal: material("#aeb6b6", 0.85, 0.27), engine: material("#404a50", 0.82, 0.43), fan: material("#8b969b", 0.85, 0.3), nozzle: material("#827b70", 0.85, 0.38), heat: material("#5c5962", 0.8, 0.4), orange: material("#d58a35", 0.5, 0.4), seam: material("#34474e", 0.1, 0.75), rubber: material("#252c2d", 0, 0.85), harness: material("#73776b", 0, 0.8), glass: new T6.MeshStandardMaterial({ color: "#a9d5de", metalness: 0.08, roughness: 0.14, transparent: true, opacity: 0.28, side: T6.DoubleSide, depthWrite: false }), screen: material("#071e24", 0.2, 0.2), instrument: new T6.MeshBasicMaterial({ color: "#6ba9a9" }), red: new T6.MeshBasicMaterial({ color: "#c64d3d" }), green: new T6.MeshBasicMaterial({ color: "#58ac8a" }) };
  mat.fan.side = mat.nozzle.side = mat.heat.side = T6.DoubleSide;
  mat.glass.forceSinglePass = true;
  mat.screenFlight = material("#143a47", 0.05, 0.5);
  mat.screenFlight.emissive.set("#1b4848");
  mat.screenNav = material("#123a30", 0.05, 0.5);
  mat.screenNav.emissive.set("#1d473c");
  const canon = /* @__PURE__ */ new Map();
  function canonical(m) {
    const key = [m.type, m.color?.getHex(), m.metalness, m.roughness, m.transparent, m.opacity, m.side, m.emissive?.getHex()].join(":");
    if (!canon.has(key)) canon.set(key, m);
    return canon.get(key);
  }
  const manifest = [];
  const gunMeshes = {};
  function add(id, name, category, object, offset, description) {
    object.updateMatrixWorld(true);
    const buckets = /* @__PURE__ */ new Map();
    object.traverse((o) => {
      if (!o.isMesh) return;
      const count = o.isInstancedMesh ? o.count : 1;
      for (let i = 0; i < count; i++) {
        const geo = o.geometry.clone(), m = scale.clone().multiply(o.matrixWorld);
        if (o.isInstancedMesh) {
          const inst = new T6.Matrix4();
          o.getMatrixAt(i, inst);
          m.multiply(inst);
        }
        geo.applyMatrix4(m);
        if (category === "Gun pods") geo.translate(0, 0.305, -0.35);
        for (const k of Object.keys(geo.attributes)) if (!["position", "normal", "uv"].includes(k)) geo.deleteAttribute(k);
        if (!geo.attributes.uv) geo.setAttribute("uv", new T6.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
        const material2 = canonical(o.material);
        if (!buckets.has(material2)) buckets.set(material2, []);
        buckets.get(material2).push(geo.index ? geo.toNonIndexed() : geo);
      }
    });
    const group = new T6.Group();
    group.name = name;
    group.userData.jetPart = id;
    for (const [m, gg] of buckets) {
      const geo = mergeGeometries(gg, false);
      geo.computeBoundingBox();
      // Each retained crash piece rotates and receives radial impulse around
      // its own center. Keep the assembled world shape unchanged.
      const center = geo.boundingBox.getCenter(new T6.Vector3());
      geo.translate(-center.x, -center.y, -center.z);
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
      const obj = new T6.Mesh(geo, m);
      obj.position.copy(center);
      obj.name = id + " " + name;
      obj.castShadow = true;
      obj.receiveShadow = true;
      obj.userData.jetPart = id;
      group.add(obj);
    }
    if (id === "WPN-P2" || id === "WPN-S2") gunMeshes[id] = group;
    else root.add(group);
    manifest.push({ id, name, category });
  }
  const context = { add, mat };
  buildAirframe(context);
  buildWings(context);
  buildEngines(context);
  buildCockpit(context);
  buildWeapons(context);
  root.userData.boost = [];
  root.userData.guns = [];
  root.userData.flashes = [];
  for (const side of [-1, 1]) {
    const glowGeo = new T6.ConeGeometry(0.3, 1.8, 12);
    glowGeo.translate(side * (1.12 * 9 / 11 - 0.68), 0.55, 0);
    const glow = new T6.Mesh(glowGeo, new T6.MeshBasicMaterial({ color: "#ffa749" }));
    glow.name = side < 0 ? "Port boost flame" : "Starboard boost flame";
    glow.rotation.x = Math.PI / 2;
    glow.position.set(side * 0.68, 0, 3.1);
    glow.visible = false;
    root.add(glow);
    root.userData.boost.push(glow);
    const mount = new T6.Group();
    mount.name = side < 0 ? "Port muzzle rotor" : "Starboard muzzle rotor";
    mount.position.set(side * 1.35, -0.15, -2);
    root.add(mount);
    root.userData.guns.push(mount);
    const group = gunMeshes[side < 0 ? "WPN-P2" : "WPN-S2"];
    for (const obj of [...group.children]) {
      // Convert the centered piece pivot to the animated mount's local frame.
      // Do not rebake the mount offset into its centered geometry.
      obj.position.sub(mount.position);
      mount.add(obj);
    }
    const flash = new T6.Mesh(new T6.ConeGeometry(0.3, 1.4, 7), new T6.MeshBasicMaterial({ color: "#ffe991" }));
    flash.name = "Cannon muzzle flash";
    flash.rotation.x = -Math.PI / 2;
    flash.position.set(0, 0, -1.5);
    flash.visible = false;
    mount.add(flash);
    root.userData.flashes.push(flash);
  }
  root.userData.jetHero = { design: "JET / 015", revision: "B", source: "standalone procedural remodel", runtimeScale: [9 / 11, 0.65, 0.66], runtimeZOffset: -0.1, parts: manifest };
  root.updateMatrixWorld(true);
  return root;
}
// One private CPU-only template per module lifetime. Nothing in this cache is
// returned to the scene or disposal code. Every aircraft owns its cloned buffers
// and materials; rebuilding a streamed aircraft does not rerun procedural lofts.
let jetTemplate = null;
let batchedJetTemplate = null;
let cachedBatcher = null;
function captureJetTemplate(root) {
  const geometryMap = new Map(), materialMap = new Map(), nodeMap = new Map();
  const geometries = [], materials = [], nodes = [];
  function indexResource(map, list, value) {
    if (!map.has(value)) { map.set(value, list.length); list.push(value.clone()); }
    return map.get(value);
  }
  function visit(object, parent) {
    const index = nodes.length;
    nodeMap.set(object, index);
    const userData = {};
    for (const [key, value] of Object.entries(object.userData)) {
      if (!["boost", "guns", "flashes"].includes(key)) userData[key] = JSON.parse(JSON.stringify(value));
    }
    nodes.push(Object.freeze({
      parent, mesh: Boolean(object.isMesh), name: object.name,
      position: object.position.toArray(), quaternion: object.quaternion.toArray(),
      scale: object.scale.toArray(), visible: object.visible,
      matrix: object.matrix.toArray(), matrixWorld: object.matrixWorld.toArray(),
      matrixAutoUpdate: object.matrixAutoUpdate, matrixWorldAutoUpdate: object.matrixWorldAutoUpdate,
      castShadow: object.castShadow, receiveShadow: object.receiveShadow,
      renderOrder: object.renderOrder, userData,
      geometry: object.isMesh ? indexResource(geometryMap, geometries, object.geometry) : -1,
      material: object.isMesh ? indexResource(materialMap, materials, object.material) : -1
    }));
    for (const child of object.children) visit(child, index);
  }
  visit(root, -1);
  return Object.freeze({
    nodes: Object.freeze(nodes), geometries: Object.freeze(geometries), materials: Object.freeze(materials),
    boost: Object.freeze(root.userData.boost.map(o => nodeMap.get(o))),
    guns: Object.freeze(root.userData.guns.map(o => nodeMap.get(o))),
    flashes: Object.freeze(root.userData.flashes.map(o => nodeMap.get(o))),
    metadata: JSON.stringify(root.userData.jetHero)
  });
}
function instantiateJetTemplate(template) {
  // Clone once per unique resource within this aircraft, never across aircraft.
  const geometries = template.geometries.map(g => g.clone());
  const materials = template.materials.map(m => m.clone());
  const nodes = [];
  for (const record of template.nodes) {
    const object = record.mesh
      ? new T6.Mesh(geometries[record.geometry], materials[record.material])
      : new T6.Group();
    object.name = record.name;
    object.position.fromArray(record.position);
    object.quaternion.fromArray(record.quaternion);
    object.scale.fromArray(record.scale);
    object.visible = record.visible;
    object.castShadow = record.castShadow;
    object.receiveShadow = record.receiveShadow;
    object.renderOrder = record.renderOrder;
    object.userData = JSON.parse(JSON.stringify(record.userData));
    object.matrix.fromArray(record.matrix);
    object.matrixWorld.fromArray(record.matrixWorld);
    object.matrixAutoUpdate = record.matrixAutoUpdate;
    object.matrixWorldAutoUpdate = record.matrixWorldAutoUpdate;
    nodes.push(object);
    if (record.parent >= 0) nodes[record.parent].add(object);
  }
  const root = nodes[0];
  root.userData.boost = template.boost.map(i => nodes[i]);
  root.userData.guns = template.guns.map(i => nodes[i]);
  root.userData.flashes = template.flashes.map(i => nodes[i]);
  root.userData.jetHero = JSON.parse(template.metadata);
  root.updateMatrixWorld(true);
  return root;
}
function buildJetHero({ batcher = null } = {}) {
  if (batcher !== null && typeof batcher !== "function") throw new TypeError("Jet batcher must be a function or null");
  if (batcher && batchedJetTemplate && batcher === cachedBatcher) return instantiateJetTemplate(batchedJetTemplate);
  let root;
  if (jetTemplate) root = instantiateJetTemplate(jetTemplate);
  else {
    root = buildJetHeroUncached();
    jetTemplate = captureJetTemplate(root);
  }
  if (batcher) {
    // Reuse the game's batching implementation, with no factory import cycle.
    // Cache only one batching strategy; a different callback is applied safely
    // to a fresh unbatched instance without growing the bounded cache.
    batcher(root);
    if (!batchedJetTemplate) {
      batchedJetTemplate = captureJetTemplate(root);
      cachedBatcher = batcher;
    }
  }
  return root;
}
export { buildJetHero };
