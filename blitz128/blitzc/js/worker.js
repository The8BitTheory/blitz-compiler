// Web Worker for js/index.html: compiles off the main thread so the page can show progress while it runs.
import { compileJob } from './blitzc.js';
onmessage = e => compileJob(e.data, m => postMessage(m));
