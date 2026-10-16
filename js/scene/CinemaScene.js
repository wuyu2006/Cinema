import * as THREE from '../../lib/three/three.module.js';
import { buildArchitecture } from './Architecture.js';
import { Seats } from './Seats.js';
import { Speakers } from './Speakers.js';
import { CinemaScreen } from './Screen.js';
import { batchStaticBoxes } from './Primitives.js';
export class CinemaScene {
  constructor(manager,lighting){
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x020306);
    this.scene.fog=new THREE.FogExp2(0x06070c,.006);
    this.camera=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,.08,110);this.camera.rotation.order='YXZ';
    this.architecture=new THREE.Group();this.scene.add(this.architecture);this.materials=buildArchitecture(this.architecture,lighting);batchStaticBoxes(this.architecture);
    this.seats=new Seats(this.scene,manager);this.speakers=new Speakers(this.scene);batchStaticBoxes(this.speakers.group);
    this.screen=new CinemaScreen(this.scene);lighting.screen=this.screen;
    this.customObjects=new Map();
  }
  update(){this.speakers.update(this.camera);}
}
