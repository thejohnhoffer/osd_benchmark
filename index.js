window.onload = function() {
  var suite = new Benchmark.Suite;
  var layers = document.getElementById("layers");
  var images = Array.from(layers.children).slice(0, 2);
  var counter = 0;

  // For WebGL
  var via = new ViaWebGL('g', 2);
  // For Canvas
  var c = document.getElementById('c');
  var ctx = c.getContext('2d');  
  var h = c.height;
  var w = c.width;

  // add tests
  suite.add('webgl', function() {

    via.gl.clear(via.gl.COLOR_BUFFER_BIT);
    via.loadImages(images);
  })
  .add('canvas', function() {

    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';

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

var ViaWebGL = function(id, nTexture) {
  var rangeTexture = [...Array(nTexture).keys()];
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
  
  this.textures = rangeTexture.map(this.gl.createTexture, this.gl);
  this.units = rangeTexture.map(i => this.gl['TEXTURE' + i]);
  this.buffer = this.gl.createBuffer();

  // Begin defining shader
  var fShader = `#version 300 es
precision highp int;
precision highp float;
precision highp sampler2D;
out vec4 fragcolor;
in vec2 uv;
`
  // Add each texture sampler to shader
  rangeTexture.forEach(n => {
    fShader += `
uniform sampler2D u_tile`+ n +';'
  });
  // Implement shader functionality
  fShader += ` 

vec3 composite(vec3 target, vec4 source) {
  target += source.rgb * source.a;
  return target;
}

void main() {

  vec3 color = vec3(0, 0, 0);
`
  // Add each texture sampler to shader
  rangeTexture.forEach(n => {
    fShader += `
  color = composite(color, texture(u_tile` + n + ', uv));'
  });
  // Return pixel in shader
  fShader += `
  fragcolor = vec4(color, 1.0);
}
`;
console.log('Fragment Shader' + fShader);

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
    var a_uv = gl.getAttribLocation(program, 'a_uv');
    
    // Assign vertex inputs
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.points_buffer, gl.STATIC_DRAW);

    // Enable vertex buffer
    gl.enableVertexAttribArray(a_uv);
    gl.vertexAttribPointer(a_uv, 2, gl.FLOAT, 0, this.one_point_size,
                 0 * this.points_list_size)

    // Set Texture for GLSL
    this.units.forEach((unit, n) => {
        var texture = this.textures[n]
        gl.uniform1i(gl.getUniformLocation(program, 'u_tile' + n), n);

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

    // Bind Texture for GLSL
    imgs.forEach((img, i) => {
      var unit = this.units[i];
      var texture = this.textures[i];

      gl.activeTexture(unit)
      gl.bindTexture(gl.TEXTURE_2D, texture);

      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
                    gl.RGBA, gl.UNSIGNED_BYTE, img);
    });

    // Draw four points
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

