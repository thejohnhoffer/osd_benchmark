// Number of images per frame
const N = 1;

const runTests = (sketches) => {
  var suite = new Benchmark.Suite();

  // For WebGL
  var via = new ViaWebGL('g0', N);

  // add tests
  suite
  .add('gldrawer', {
    "defer": true,
    "fn": function(deferred) {
      via.gl.clear(via.gl.COLOR_BUFFER_BIT);

      via.loadImages(sketches);
      via.gl.drawArrays(via.gl.TRIANGLE_STRIP, 0, 4);
      // May not be faster than 60 fps
      let resolve = deferred.resolve.bind(deferred);
      window.requestAnimationFrame(resolve);
    }
  })
  // add listeners
  .on('cycle', function(event) {
    if (event.target.aborted) {
      console.error(event.target.error);
      return;
    }
    var name = event.target.name;
    var el = document.getElementById(name);
    el.innerText = String(event.target);
  })
  .on('complete', function() {
    var el = document.getElementById("result");
    var name = this.filter('fastest').map('name');
    el.innerText = "Fastest: " + name;
  })
  // run async
  .run({ 'async': true });
};

const requestImage = i => {
  return new Promise((resolve, reject) => {
    let img = new Image();
    img.onload = function() {
      let in_w = this.width;
      let in_h = this.height;
      let canvas = document.createElement('canvas');
      let context = canvas.getContext('2d');
      canvas.height = in_h;
      canvas.width = in_w;
      context.drawImage(img, 0, 0);
      // Return image data object
      resolve(context.getImageData(0, 0, in_w, in_h));
    };
    img.src = 'images/' + i + '.png';
  });
};

window.onload = () => {
  const rangeImages = [...Array(N).keys()];
  const requests = rangeImages.map(requestImage);
  Promise.all(requests).then(runTests);
};

const Builder = function(gl, n) {
  this.range = [...Array(this.n).keys()];
  this.gl = gl;
  this.n = n;
};

Builder.prototype = {
  tileN: function(n) {
    return 'u_tile' + n;
  },

  get samplers () {
    const doOne = function(n) {
      return 'uniform sampler2D ' + this.tileN(n);
    };
    return this.range.map(doOne, this).join(';\n') + ';';
  },

  get call_composite () {
    const doOne = function(n) {
      const params = this.tileN(n) + ', uv';
      return 'color = composite(color, texture(' + params + '))';
    };
    return this.range.map(doOne, this).join(';\n') + ';';
  },
  
  get header () {
  return `#version 300 es
precision highp int;
precision highp float;
precision highp sampler2D;
out vec4 fragcolor;
in vec2 uv;
` + this.samplers;
  },

  get composite () {
     return `
vec3 composite(vec3 target, vec4 source) {
  target += source.rgb * source.a;
  return target;
}
`; 
  },

  get main () {
  
    return `
void main() {

  vec3 color = vec3(0, 0, 0);
` + this.call_composite + `
  fragcolor = vec4(color, 1.0);
}
`;
  },

  get vertex () {
    return `#version 300 es
in vec2 a_uv;
out vec2 uv;

void main() {
  uv = a_uv;
  vec2 full_pos = 2. * a_uv - 1.;
  gl_Position = vec4(full_pos, 0., 1.);
}
`;
  },

  get fragment () {

    // Begin defining shader
    const fShader = this.header + this.composite + this.main;

    console.log('Fragment Shader' + fShader);
    return fShader;
  },

  get program () {
    const gl = this.gl;
    const p = gl.createProgram();

    this.compile(p, gl.VERTEX_SHADER, this.vertex);
    this.compile(p, gl.FRAGMENT_SHADER, this.fragment);

    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)){
      console.log(gl.getProgramInfoLog(p));
    }
    return p;
  },

  compile: function(p, type, file) {
    const gl = this.gl;
    const shader =  gl.createShader(type);

    gl.shaderSource(shader, file);
    gl.compileShader(shader);
    gl.attachShader(p, shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)){
      console.log(gl.getShaderInfoLog(shader));
    }
  }
};

var ViaWebGL = function(id, nTexture) {
  // Define vertex input buffer
  this.one_point_size = 2 * Float32Array.BYTES_PER_ELEMENT;
  this.points_list_size = 4 * this.one_point_size;
  this.points_buffer = new Float32Array([
    0, 1, 0, 0, 1, 1, 1, 0
  ]);

  // Make texture and gl context
  var g = document.getElementById(id);
  this.gl = g.getContext('webgl2');
  this.gl.viewport(0, 0, g.width, g.height);

  const rangeTexture = [...Array(this.n).keys()];
  this.textures = rangeTexture.map(this.gl.createTexture, this.gl);
  this.units = rangeTexture.map(i => this.gl['TEXTURE' + i]);
  this.buffer = this.gl.createBuffer();

  // Make shaders
  var builder = new Builder(this.gl, nTexture);
  this.toBuffers(builder.program);
};

ViaWebGL.prototype = {

  // Load data to the buffers
  toBuffers: function(program) {

    var gl = this.gl;
    gl.useProgram(program);
    var a_uv = gl.getAttribLocation(program, 'a_uv');

    // Assign vertex inputs
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.points_buffer, gl.STATIC_DRAW);

    // Enable vertex buffer
    gl.enableVertexAttribArray(a_uv);
    gl.vertexAttribPointer(a_uv, 2, gl.FLOAT, 0, this.one_point_size,
                 0 * this.points_list_size);

    // Set Texture for GLSL
    this.units.forEach((unit, n) => {
        var texture = this.textures[n];
        gl.uniform1i(gl.getUniformLocation(program, 'u_tile' + n), n);

        gl.activeTexture(unit);
        gl.bindTexture(gl.TEXTURE_2D, texture);

        // Assign texture parameters
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    });

  },
  loadImages: function(imgs) {

    var gl = this.gl;

    // Bind Texture for GLSL
    imgs.forEach((img, i) => {
      var texture = this.textures[i];

      gl.bindTexture(gl.TEXTURE_2D, texture);

      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
                    gl.RGBA, gl.UNSIGNED_BYTE, img);
    });
  }
};

