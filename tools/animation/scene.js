function createTonieScene(THREE) {
  var renderer = new THREE.WebGLRenderer({alpha:true, antialias:true, powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000,0);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  var scene=new THREE.Scene();
  var camera=new THREE.PerspectiveCamera(33,1,.1,40);
  camera.position.set(1.9,7.25,8.7);
  camera.lookAt(.28,1.90,0);
  scene.add(new THREE.HemisphereLight(0xdaf2ff,0x8a94a5,2.1));
  var key=new THREE.DirectionalLight(0xfff4e0,3.2);
  key.position.set(-3.5,7,5); key.castShadow=true;
  key.shadow.mapSize.set(1024,1024); key.shadow.camera.left=-3;key.shadow.camera.right=3;key.shadow.camera.top=4;key.shadow.camera.bottom=-2;
  key.shadow.normalBias=.025;key.shadow.bias=-.0001;key.shadow.radius=3;
  scene.add(key);
  var fill=new THREE.DirectionalLight(0xc7e8ff,1);fill.position.set(4,3,-3);scene.add(fill);
  function material(color,roughness){return new THREE.MeshStandardMaterial({color:color,roughness:roughness==null?.8:roughness,metalness:0});}
  function mesh(geo,mat,x,y,z,parent){var o=new THREE.Mesh(geo,mat);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;(parent||scene).add(o);return o;}
  function roundedBox(w,h,d,r){
    var geo=new THREE.BoxGeometry(w,h,d,8,8,8),p=geo.attributes.position;
    var core=new THREE.Vector3(),v=new THREE.Vector3(),delta=new THREE.Vector3();
    for(var i=0;i<p.count;i++){
      v.fromBufferAttribute(p,i);
      core.set(Math.max(-w/2+r,Math.min(w/2-r,v.x)),Math.max(-h/2+r,Math.min(h/2-r,v.y)),Math.max(-d/2+r,Math.min(d/2-r,v.z)));
      delta.subVectors(v,core).normalize().multiplyScalar(r);v.copy(core).add(delta);p.setXYZ(i,v.x,v.y,v.z);
    }
    geo.computeVertexNormals();return geo;
  }
  function ellipsoid(x,y,z,sx,sy,sz,mat,parent){var o=mesh(new THREE.SphereGeometry(1,24,18),mat,x,y,z,parent);o.scale.set(sx,sy,sz);return o;}
  function cylinder(x,y,z,rt,rb,h,mat,parent){return mesh(new THREE.CylinderGeometry(rt,rb,h,28),mat,x,y,z,parent);}
  function tube(points,r,mat,parent){var path=new THREE.CatmullRomCurve3(points.map(function(v){return new THREE.Vector3(v[0],v[1],v[2]);}));return mesh(new THREE.TubeGeometry(path,24,r,7,false),mat,0,0,0,parent);}
  var fabric=material(0x459cc7,.98);
  var texCanvas=document.createElement('canvas');texCanvas.width=texCanvas.height=128;
  var tx=texCanvas.getContext('2d');tx.fillStyle='#929292';tx.fillRect(0,0,128,128);
  for(var row=0;row<32;row++){for(var col=0;col<32;col++){
    tx.fillStyle=(row+col)%2?'#bcbcbc':'#666666';tx.fillRect(col*4,row*4,3,2);tx.fillStyle='#989898';tx.fillRect(col*4+1,row*4+2,2,2);
  }}
  var bump=new THREE.CanvasTexture(texCanvas);bump.wrapS=bump.wrapT=THREE.RepeatWrapping;bump.repeat.set(5,5);fabric.bumpMap=bump;fabric.bumpScale=.022;
  mesh(roundedBox(2,2,2,.10),fabric,0,1,0);
  // Every part below is positioned in the same x/y/z coordinate system.
  var ivory=material(0xf5f3e9,.47),rim=material(0xe0ded4,.7),padmat=material(0x729d9f,.77);
  mesh(roundedBox(1.77,.057,1.77,.026),rim,0,2.008,0);
  mesh(roundedBox(1.70,.044,1.70,.020),ivory,0,2.044,0);
  mesh(roundedBox(1.04,.015,1.00,.007),padmat,0,2.071,-.085);
  var ledMat=new THREE.MeshStandardMaterial({color:0x8aff81,emissive:0x65ff59,emissiveIntensity:1.8,roughness:.6});
  var ledGroup=new THREE.Group();scene.add(ledGroup);
  var cy=0,cz=-.085;
  [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(function(s){
    var sx=s[0],sz=s[1];
    var strip=tube([[sx*.04,cy,cz+sz*.23],[sx*.16,cy,cz+sz*.23],[sx*.218,cy,cz+sz*.216],[sx*.23,cy,cz+sz*.16],[sx*.23,cy,cz+sz*.04]],.014,ledMat,ledGroup);
    strip.scale.y=.001;strip.position.y=2.0785;strip.castShadow=false;
  });
  var black=material(0x18242d,.65);
  cylinder(-.54,2.082,.40,.035,.035,.014,black);
  // Speaker perforations and stitch lines are on the front plane, not screen overlays.
  var speakerGeo=new THREE.CircleGeometry(.018,12),speakerMat=material(0x184360,1);
  for(var yy=0;yy<12;yy++){for(var xx=0;xx<12;xx++){
    var dx=(xx-5.5)*.082,dy=(yy-5.5)*.074;
    if(dx*dx/0.26+dy*dy/.27>1.1)continue;
    if(yy>7&&xx>2&&xx<9)continue;
    var hole=mesh(speakerGeo,speakerMat,dx,1.0+dy,1.002);hole.castShadow=false;
  }}
  var stitch=material(0x3488b4,.95);
  for(var j=0;j<25;j++){
    mesh(new THREE.BoxGeometry(.045,.004,.003),stitch,-.86+j*.07,1.80,1.002).castShadow=false;
    mesh(new THREE.BoxGeometry(.045,.004,.003),stitch,-.86+j*.07,.18,1.002).castShadow=false;
  }
  var rubber=material(0x363d40,.62);
  function ear(x,w,h,lean){
    var shape=new THREE.Shape();
    shape.moveTo(-w/2,0);shape.lineTo(w/2,0);shape.quadraticCurveTo(w/2+.015,.025,w/2-.015,.06);
    shape.lineTo(lean+.052,h-.055);shape.quadraticCurveTo(lean+.025,h+.012,lean-.029,h-.005);
    shape.lineTo(-w/2+.012,.058);shape.quadraticCurveTo(-w/2-.022,.016,-w/2,0);
    var g=new THREE.ExtrudeGeometry(shape,{depth:.16,bevelEnabled:true,bevelThickness:.025,bevelSize:.025,bevelSegments:4,steps:1,curveSegments:12});
    g.translate(0,0,-.08);
    g.computeBoundingBox();
    var e=new THREE.Group();e.position.set(x,2.075,.65);e.userData.tipY=g.boundingBox.max.y;
    var verts=g.attributes.position,sumX=0,tipCount=0;
    for(var k=0;k<verts.count;k++){if(Math.abs(verts.getY(k)-e.userData.tipY)<.001){sumX+=verts.getX(k);tipCount++;}}
    e.userData.tipX=tipCount?sumX/tipCount:0;
    e.userData.geometry=g;e.userData.rest=new Float32Array(verts.array);
    scene.add(e);mesh(g,rubber,0,0,0,e);return e;
  }
  var leftEar=ear(-.38,.28,.22,-.055);
  var rightEar=ear(.40,.30,.325,.05);
  // The supplied illustration has a rear hand layer and a foreground thumb.
  // Reuse the real ear geometry between them, preserving its exact perspective.
  var earOverlayMaterial=rubber.clone();
  earOverlayMaterial.transparent=true;earOverlayMaterial.depthTest=false;earOverlayMaterial.depthWrite=false;
  var earOverlay=new THREE.Mesh(rightEar.userData.geometry,earOverlayMaterial);
  earOverlay.renderOrder=20;earOverlay.visible=false;rightEar.add(earOverlay);
  // A deliberately stylized volumetric toy replaces the front-facing photo cutout.
  function makeFigure(pirate){
    var g=new THREE.Group();scene.add(g);
    var skin=material(0xffcf9a,.68),pants=material(pirate?0x79b735:0x77714d,.8),dark=material(0x293844,.75),shirt=material(pirate?0xf7f6e8:0xceb795,.82),hat=material(pirate?0xe74d39:0x576674,.7);
    cylinder(0,.025,0,.22,.22,.05,dark,g);
    ellipsoid(-.095,.083,.053,.074,.045,.12,dark,g);ellipsoid(.095,.083,.053,.074,.045,.12,dark,g);
    cylinder(-.093,.20,0,.06,.064,.24,pants,g);cylinder(.093,.20,0,.06,.064,.24,pants,g);
    var torso=mesh(roundedBox(.32,.33,.20,.075),shirt,0,.43,0,g);
    if(pirate){for(var a=0;a<4;a++)mesh(roundedBox(.322,.019,.207,.009),material(0x27788e),0,.33+a*.063,0,g);}
    else{cylinder(0,.425,.117,.05,.05,.017,material(0xb6c4ce),g).rotation.x=Math.PI/2;}
    ellipsoid(-.205,.45,0,.062,.17,.066,shirt,g);ellipsoid(.205,.45,0,.062,.17,.066,shirt,g);
    ellipsoid(-.205,.30,.02,.055,.058,.05,skin,g);ellipsoid(.205,.30,.02,.055,.058,.05,skin,g);
    ellipsoid(0,.74,0,.195,.20,.17,skin,g);
    ellipsoid(-.196,.735,0,.035,.060,.040,skin,g);ellipsoid(.196,.735,0,.035,.060,.040,skin,g);
    ellipsoid(0,.712,.171,.04,.045,.045,skin,g);
    ellipsoid(-.073,.77,.158,.014,.023,.007,dark,g);ellipsoid(.073,.77,.158,.014,.023,.007,dark,g);
    tube([[-.058,.66,.155],[0,.646,.173],[.052,.663,.156]],.009,dark,g);
    var cap=mesh(new THREE.SphereGeometry(.204,24,12,0,Math.PI*2,0,Math.PI/2),hat,0,.80,0,g);cap.scale.y=.67;
    if(pirate){
      mesh(roundedBox(.41,.075,.33,.025),hat,0,.81,.015,g);
      ellipsoid(.065,.77,.166,.047,.040,.012,dark,g);
      tube([[-.17,.85,.095],[0,.80,.173],[.17,.73,.09]],.008,dark,g);
      ellipsoid(.22,.80,-.055,.065,.033,.038,hat,g);
      var tail=mesh(roundedBox(.16,.043,.07,.018),hat,.26,.735,-.045,g);tail.rotation.z=-.8;
    }else{
      mesh(roundedBox(.31,.026,.23,.012),hat,0,.81,.14,g);
      tube([[0,.938,-.12],[0,.963,0],[0,.938,.13]],.009,material(0x2f4050),g);
    }
    g.scale.setScalar(1.28);return g;
  }
  var figures=[makeFigure(false),makeFigure(true)];
  var hand=createPinchHand(THREE);scene.add(hand.group);
  var ground=mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.09}),0,-.012,0);ground.rotation.x=-Math.PI/2;ground.castShadow=false;
  var holder=null,phase=1,child=1,start=0,frame=0,stopped=false,lastTime=0;
  var reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function smooth(a,b,t){t=Math.max(0,Math.min(1,(t-a)/(b-a)));return t*t*(3-2*t);}
  function colorLed(ready,t){
    var c=ready?0x8bff72:0x33bdff;ledMat.color.setHex(c);ledMat.emissive.setHex(c);ledMat.emissiveIntensity=ready?1.5:(.45+1.4*(.5+.5*Math.sin(t*6.5)));
  }
  var lastSqueeze=-1;
  function squeezeEar(amount){
    if(amount===lastSqueeze)return;lastSqueeze=amount;
    var geo=rightEar.userData.geometry,p=geo.attributes.position,rest=rightEar.userData.rest;
    for(var i=0;i<p.count;i++){
      var y=rest[i*3+1],weight=smooth(.02,.13,y);
      p.setZ(i,rest[i*3+2]*(1-.14*amount*weight));
    }
    p.needsUpdate=true;geo.computeVertexNormals();
  }
  function pose(seconds){
    figures.forEach(function(f,i){f.visible=(phase===0||phase===3)&&i===child;});
    var f=figures[child];f.position.set(0,2.0785,-.07);f.rotation.y=0;
    if(phase!==1)squeezeEar(0);hand.group.visible=false;earOverlay.visible=false;
    colorLed(true,seconds);
    if(phase===0){var t=seconds%4.7;var lift=smooth(.5,1.7,t);if(t>3.3)lift=1-smooth(3.3,4.5,t);f.position.y+=lift*.75;}
    if(phase===1){
      var t=reduced?2:seconds%6.4;
      var approach=smooth(.10,1.0,t)*(1-smooth(5.1,6.05,t));
      var hold=smooth(1.05,1.45,t)*(1-smooth(4.45,4.90,t));
      squeezeEar(hold);
      hand.update(hold,approach,camera);
      earOverlay.visible=hand.group.visible;
    }
    if(phase===2)colorLed(seconds>=5.5,seconds);
    if(phase===3){f.position.y+=(1-smooth(0,1.4,seconds))*.8;colorLed(seconds>=6.0,seconds);}
    if(reduced){if(phase===0)f.position.y=2.65;if(phase===3)f.position.y=2.0785;}
  }
  // Keep the viewing direction fixed. Frame the pinch more closely so both
  // fingertips remain legible, reserving headroom only for figure movement.
  function fitCamera(w,h){
    var figureStep=phase===0||phase===3;
    var target=new THREE.Vector3(figureStep?.28:.48,figureStep?1.90:1.42,0);
    camera.position.copy(target).add(new THREE.Vector3(1.62,5.35,8.7));
    camera.lookAt(target);
    camera.aspect=w/h;camera.zoom=1;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
    var boxes=[[[ -1.1,0,-1.1],[1.1,2.45,1.1]],[[.0,1.3,.19],[2.75,2.95,1.7]]];
    if(figureStep)boxes.push([[-.44,2.07,-.48],[.44,4.13,.4]]);
    var mx=0,my=0;
    boxes.forEach(function(b){for(var a=0;a<8;a++){var v=new THREE.Vector3(b[(a&1)?1:0][0],b[(a&2)?1:0][1],b[(a&4)?1:0][2]).project(camera);mx=Math.max(mx,Math.abs(v.x));my=Math.max(my,Math.abs(v.y));}});
    camera.zoom=Math.min(.91/mx,.91/my);camera.updateProjectionMatrix();
  }
  function tick(now){
    if(stopped)return;frame=requestAnimationFrame(tick);
    if(!holder||!holder.isConnected||document.hidden)return;
    if(now-lastTime<33)return;lastTime=now;
    var w=holder.clientWidth,h=holder.clientHeight;
    if(!w||!h)return;
    if(renderer.domElement.clientWidth!==w||renderer.domElement.clientHeight!==h){renderer.setSize(w,h);fitCamera(w,h);}
    pose((now-start)/1000);renderer.render(scene,camera);
  }
  frame=requestAnimationFrame(tick);
  return {
    mount:function(node,p,c){holder=node;phase=p;child=c%2;start=performance.now();node.appendChild(renderer.domElement);renderer.setSize(node.clientWidth,node.clientHeight);fitCamera(node.clientWidth,node.clientHeight);pose(0);renderer.render(scene,camera);},
    unmount:function(){holder=null;},
    dispose:function(){stopped=true;cancelAnimationFrame(frame);renderer.dispose();scene.traverse(function(o){if(o.geometry)o.geometry.dispose();});bump.dispose();}
  };
}
