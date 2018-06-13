import _ from 'lodash';
import process from 'process';

const benchmark = require('benchmark');
const Benchmark = benchmark.runInContext({ _, process });
window.Benchmark = Benchmark;

window.onload = function() {
  var suite = new Benchmark.Suite;

  // For WebGL
  var via = new ViaWebGL('g');
  // For Canvas
  var c = document.getElementById('c');
  var ctx = c.getContext('2d');  
  var h = c.height;
  var w = c.width;

  // add tests
  suite.add('webgl', function() {

    via.gl.clear(via.gl.COLOR_BUFFER_BIT);
    var layers = document.getElementById("layers");
    var images = Array.from(layers.children);
    via.loadImages(images);
  })
  .add('canvas', function() {

    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';

    var layers = document.getElementById("layers");
    var images = Array.from(layers.children);
    images.forEach(function(image){
        ctx.drawImage(image, 0, 0, w, h);
    })
  })
  // add listeners
  .on('cycle', function(event) {
    if (event.target.aborted) {
      console.error(event.target.error);
      return;
    }
    var name = event.target.name;
    var el = document.getElementById(name+"_msg");
    el.innerText = String(event.target);
  })
  .on('complete', function() {
    var el = document.getElementById("result");
    var name = this.filter('fastest').map('name');
    el.innerText = "Fastest: " + name;
  })
  // run async
  .run({ 'async': true });
}

var ViaWebGL = function(id) {
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
  this.textures = [0, 1].map(this.gl.createTexture, this.gl);
  this.units = [this.gl.TEXTURE0, this.gl.TEXTURE1];
  this.buffer = this.gl.createBuffer();

  var fShader = `#version 300 es
precision highp int;
precision highp float;
precision highp sampler2D;
uniform sampler2D u_tile0;
uniform sampler2D u_tile1;

in vec2 uv;
out vec4 fragcolor;

void main() {

  vec4 p0 = texture(u_tile0, uv);
  vec4 p1 = texture(u_tile1, uv);
  vec3 color = p0.rgb * p0.a;
  color += p1.rgb * p1.a;

  fragcolor = vec4(color, 1.0);
}
`;

  var vShader = `#version 300 es
in vec2 a_uv;
out vec2 uv;

void main() {
  uv = a_uv;
  vec2 full_pos = 2. * a_uv - 1.;
  gl_Position = vec4(full_pos, 0., 1.);  
}
`;

this.toBuffers(this.toProgram([vShader, fShader]));
};

ViaWebGL.prototype = {

  // Link shaders from strings
  toProgram: function(files) {
    var gl = this.gl;
    var program = gl.createProgram();
    // 1st is vertex; 2nd is fragment
    files.map(function(given,i) {
      var sh = ['VERTEX_SHADER', 'FRAGMENT_SHADER'][i];
      var shader = gl.createShader(gl[sh]);
      gl.shaderSource(shader, given);
      gl.compileShader(shader);
      gl.attachShader(program, shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)){
        console.log(gl.getShaderInfoLog(shader));
      }
    });
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)){
      console.log(gl.getProgramInfoLog(program));
    }
    return program;
  },

  // Load data to the buffers
  toBuffers: function(program) {

    var gl = this.gl;
    gl.useProgram(program);

    // Get GLSL locations
    var a_uv = gl.getAttribLocation(program, 'a_uv');
    var u_tile0 = gl.getUniformLocation(program, 'u_tile0');
    var u_tile1 = gl.getUniformLocation(program, 'u_tile1');
    gl.uniform1i(u_tile0, 0);
    gl.uniform1i(u_tile1, 1);
    
    // Assign vertex inputs
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.points_buffer, gl.STATIC_DRAW);

    // Enable vertex buffer
    gl.enableVertexAttribArray(a_uv);
    gl.vertexAttribPointer(a_uv, 2, gl.FLOAT, 0, this.one_point_size,
                 0 * this.points_list_size)

    // Set Texture for GLSL
    var textures = this.textures;
    this.units.forEach(function(unit, i) {
        var texture = textures[i]

        gl.activeTexture(unit);
        gl.bindTexture(gl.TEXTURE_2D, texture);

        // Assign texture parameters
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    });

  },
  loadImages: function(imgs) {

    var gl = this.gl;
    var units = this.units;
    var textures = this.textures;

    imgs.forEach(function(img, i) {
      var unit = units[i]
      var texture = textures[i]

      gl.activeTexture(unit)
      gl.bindTexture(gl.TEXTURE_2D, texture);

      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
                    gl.RGBA, gl.UNSIGNED_BYTE, img);
    });

    // Draw four points
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    return this.gl.canvas;
  }
}

