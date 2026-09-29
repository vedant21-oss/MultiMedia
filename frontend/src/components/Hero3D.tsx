import { useEffect, useRef } from 'react';

/**
 * A raymarched 3D render: three glossy bodies (video, audio, documents) orbit
 * and melt into one core — cross-modal fusion as an object. Pure WebGL, no
 * library. Pauses off-screen; renders one still frame under reduced motion.
 */
const VERT = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;

const FRAG = `
precision highp float;
uniform vec2 R; uniform float T; uniform vec2 M; uniform float F;
float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
float map(vec3 p){
  p.xz*=rot(M.x*.6+T*.12); p.yz*=rot(M.y*.4);
  float core=length(p)-mix(.42,.78,F)+.035*sin(6.*p.x+T)*sin(6.*p.y+T*1.3)*sin(6.*p.z);
  float d=core;
  for(int i=0;i<3;i++){
    float fi=float(i), a=T*.55+fi*2.094;
    float r=mix(1.75+.25*sin(T*.4+fi*1.7), .15, F);
    vec3 c=vec3(cos(a)*r, sin(a*1.3+fi)*.35, sin(a)*r);
    d=smin(d,length(p-c)-mix(.34,.3,F),mix(.3,.6,F));
  }
  return d;
}
vec3 nrm(vec3 p){vec2 e=vec2(.0015,0);return normalize(vec3(map(p+e.xyy)-map(p-e.xyy),map(p+e.yxy)-map(p-e.yxy),map(p+e.yyx)-map(p-e.yyx)));}
void main(){
  vec2 uv=(gl_FragCoord.xy-.5*R)/min(R.x,R.y);
  uv-=vec2(.42,.12)*step(1.2,R.x/R.y)*(1.-F); // wide screens: sit right of the headline, drift to centre as it fuses
  vec3 ro=vec3(0,0,3.6), rd=normalize(vec3(uv,-1.55));
  float t=0.; bool hit=false;
  for(int i=0;i<80;i++){float d=map(ro+rd*t); if(d<.001){hit=true;break;} t+=d; if(t>7.)break;}
  if(!hit){gl_FragColor=vec4(0.);return;}
  vec3 p=ro+rd*t, n=nrm(p), l=normalize(vec3(-.5,.8,.6));
  float dif=max(dot(n,l),0.), fr=pow(1.-max(dot(n,-rd),0.),3.);
  float spec=pow(max(dot(reflect(-l,n),-rd),0.),48.);
  // thin-film iridescence: hue shifts with view angle
  vec3 film=.5+.5*cos(6.2831*(fr*.9+n.y*.15+vec3(.0,.33,.67))+T*.2);
  vec3 base=vec3(.055,.055,.065);
  vec3 col=base*(.35+.65*dif)+film*fr*.95+vec3(1.)*spec*.9;
  col+=vec3(.83,1.,.31)*pow(max(dot(n,normalize(vec3(.7,-.4,.5))),0.),6.)*.35; // accent rim light
  gl_FragColor=vec4(pow(col,vec3(.4545)),1.);
}`;

/**
 * `scrollFusion`: the bodies start apart and melt into one core as the page
 * scrolls through its first two screens.
 */
export function Hero3D({
  className, scrollFusion = false,
}: { className?: string; scrollFusion?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { premultipliedAlpha: false, antialias: false });
    if (!gl) return;

    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uR = gl.getUniformLocation(prog, 'R');
    const uT = gl.getUniformLocation(prog, 'T');
    const uM = gl.getUniformLocation(prog, 'M');
    const uF = gl.getUniformLocation(prog, 'F');
    let fusion = scrollFusion ? 0 : 0.35;

    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = (e: PointerEvent) => {
      mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('pointermove', onMove);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    let visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(canvas);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const start = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      mouse.x += (mouse.tx - mouse.x) * 0.05;
      mouse.y += (mouse.ty - mouse.y) * 0.05;
      if (scrollFusion) {
        const target = Math.min(1, window.scrollY / (window.innerHeight * 2.2));
        fusion += (target - fusion) * 0.08;
      }
      if (visible) {
        gl.uniform1f(uF, fusion);
        gl.uniform2f(uR, canvas.width, canvas.height);
        gl.uniform1f(uT, reduced ? 2 : (now - start) / 1000);
        gl.uniform2f(uM, mouse.x, mouse.y);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      if (!reduced) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener('pointermove', onMove);
    };
  }, [scrollFusion]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
