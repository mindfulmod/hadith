import {store} from './store.js';
import {release} from './release.mjs';
const theme=store.get().theme;
document.documentElement.dataset.theme=theme==='night'||(theme==='device'&&matchMedia('(prefers-color-scheme:dark)').matches)?'night':'day';
document.querySelector('meta[name="theme-color"]').content=getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
document.querySelector('#release-label').textContent='Reader release: '+release.id;
