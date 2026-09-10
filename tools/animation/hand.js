/* User-selected CC0 illustration: https://www.svgrepo.com/svg/434198/pinch-hand-skin-3 */
function createPinchHand(THREE) {
  var group=new THREE.Group();
  group.name='illustrated-pinch-hand';
  var asset=JSON.parse(document.getElementById('th-hand-art').textContent);
  var parts=[],ready=0,lastHold=-1,lastDistance=-1;
  function layer(uri,depth){
    var picture=new Image();
    var texture=new THREE.Texture();texture.colorSpace=THREE.SRGBColorSpace;
    picture.onload=function(){texture.image=picture;texture.needsUpdate=true;ready++;};
    picture.src=uri;
    var geometry=new THREE.PlaneGeometry(1,1,40,40);
    var material=new THREE.MeshBasicMaterial({map:texture,transparent:true,alphaTest:.01,depthWrite:false,depthTest:false,side:THREE.DoubleSide});
    var mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=depth<0?10:30;group.add(mesh);
    parts.push({mesh:mesh,depth:depth,rest:new Float32Array(geometry.attributes.position.array)});
  }
  layer(asset.back,-.15);
  layer(asset.thumb,.15);
  var viewDirection=new THREE.Vector3();
  function update(hold,approach,camera){
    var away=1-approach;
    group.visible=ready===2&&approach>.001;
    group.position.set(.43+.30*away,2.245+.20*away,.65+.12*away);
    group.quaternion.copy(camera.quaternion);
    camera.getWorldDirection(viewDirection);
    var cameraOffset=group.position.clone().sub(camera.position);
    var distance=cameraOffset.dot(viewDirection);
    var anchorX=cameraOffset.dot(new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion));
    var anchorY=cameraOffset.dot(new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion));
    if(hold===lastHold&&Math.abs(distance-lastDistance)<.00001)return;
    lastHold=hold;lastDistance=distance;
    parts.forEach(function(part){
      var p=part.mesh.geometry.attributes.position,rest=part.rest;
      // Both layers project to exactly the same drawing. Only their depth differs:
      // index behind the real ear, thumb in front of its lower face.
      var projectionScale=(distance-part.depth)/distance;
      for(var i=0;i<p.count;i++){
        var sx=(rest[i*3]+.5)*80,sy=(.5-rest[i*3+1])*80;
        var tipWeight=1-THREE.MathUtils.smoothstep(sx,17,43);
        var side=THREE.MathUtils.clamp((28.2-sy)/1.6,-1,1);
        // Align the rounded ends of both fingers with the ear. The longer index
        // is drawn in slightly so the two pads meet opposite faces at one point.
        var indexInset=3*(1-THREE.MathUtils.smoothstep(sx,11,31))*Math.max(0,side);
        var x=(sx+indexInset-11.5)*.032;
        // Open the pads on approach, then squeeze only their gap. Their point of
        // contact stays at the ear throughout the three-second hold.
        var y=(28.2-sy)*.032+side*(.040-.058*hold)*tipWeight;
        p.setXYZ(i,x*projectionScale-anchorX*part.depth/distance,y*projectionScale-anchorY*part.depth/distance,part.depth);
      }
      p.needsUpdate=true;
    });
  }
  return {group:group,update:update};
}
