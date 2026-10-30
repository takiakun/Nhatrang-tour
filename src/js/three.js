// three.js r186 (npm) cùng OrbitControls, GLTFLoader gộp vào một đối tượng THREE như bản UMD cũ.
// Bản build thử nghiệm (`vite build --mode test`) thay file này bằng window.THREE do test chèn vào (xem vite.config.mjs).
import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
export const THREE = Object.assign({}, T, { OrbitControls, GLTFLoader });
