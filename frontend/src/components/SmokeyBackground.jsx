import { useEffect, useRef } from 'react'

// Fundo animado em WebGL: ondas de "fumaça" que reagem ao mouse. WebGL puro,
// sem dependência nova — o shader inteiro cabe nas duas strings abaixo.

const VERTEX_SHADER = `
  attribute vec4 a_position;
  void main() {
    gl_Position = a_position;
  }
`

const FRAGMENT_SHADER = `
precision mediump float;

uniform vec2 iResolution;
uniform float iTime;
uniform vec3 u_color;

void mainImage(out vec4 fragColor, in vec2 fragCoord){
    vec2 centeredUV = (2.0 * fragCoord - iResolution.xy) / min(iResolution.x, iResolution.y);
    float time = iTime * 0.22;

    // A origem da onda percorre uma orbita lenta em vez de seguir o cursor.
    // Os dois eixos usam frequencias diferentes (0.21 e 0.17) de proposito: se
    // fossem iguais o caminho fecharia num circulo e a repeticao ficaria obvia.
    vec2 deriva = vec2(sin(iTime * 0.21), cos(iTime * 0.17)) * 0.65;

    // Distorcao acumulada: cada iteracao dobra a malha um pouco mais, e e essa
    // soma que produz o aspecto de fumaca em vez de onda regular.
    vec2 distortion = centeredUV;
    for (float i = 1.0; i < 8.0; i++) {
        distortion.x += 0.5 / i * cos(i * 2.0 * distortion.y + time + deriva.x * 3.1415);
        distortion.y += 0.5 / i * cos(i * 2.0 * distortion.x + time + deriva.y * 3.1415);
    }

    float wave = abs(sin(distortion.x + distortion.y + time));
    float glow = smoothstep(0.9, 0.2, wave);

    fragColor = vec4(u_color * glow, 1.0);
}

void main() {
    mainImage(gl_FragColor, gl_FragCoord.xy);
}
`

function hexToRgb(hex) {
  const normalizado = String(hex).replace('#', '')
  return [
    parseInt(normalizado.substring(0, 2), 16) / 255,
    parseInt(normalizado.substring(2, 4), 16) / 255,
    parseInt(normalizado.substring(4, 6), 16) / 255,
  ]
}

export default function SmokeyBackground({ color = '#2e79ad', className = '' }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl')
    if (!gl) return  // Sem WebGL o componente simplesmente não pinta nada.

    function compilar(tipo, fonte) {
      const shader = gl.createShader(tipo)
      gl.shaderSource(shader, fonte)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('[SmokeyBackground] shader não compilou:', gl.getShaderInfoLog(shader))
        gl.deleteShader(shader)
        return null
      }
      return shader
    }

    const vertexShader = compilar(gl.VERTEX_SHADER, VERTEX_SHADER)
    const fragmentShader = compilar(gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
    if (!vertexShader || !fragmentShader) return

    const program = gl.createProgram()
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[SmokeyBackground] link falhou:', gl.getProgramInfoLog(program))
      return
    }
    gl.useProgram(program)

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW)

    const posicao = gl.getAttribLocation(program, 'a_position')
    gl.enableVertexAttribArray(posicao)
    gl.vertexAttribPointer(posicao, 2, gl.FLOAT, false, 0, 0)

    const uResolucao = gl.getUniformLocation(program, 'iResolution')
    const uTempo     = gl.getUniformLocation(program, 'iTime')
    const uCor       = gl.getUniformLocation(program, 'u_color')

    gl.uniform3f(uCor, ...hexToRgb(color))

    const inicio = Date.now()
    let frameId

    function desenhar() {
      // Resolução do canvas acompanha o tamanho em CSS; sem isso a imagem estica.
      const largura = canvas.clientWidth
      const altura = canvas.clientHeight
      if (canvas.width !== largura || canvas.height !== altura) {
        canvas.width = largura
        canvas.height = altura
        gl.viewport(0, 0, largura, altura)
      }

      gl.uniform2f(uResolucao, largura, altura)
      gl.uniform1f(uTempo, (Date.now() - inicio) / 1000)

      gl.drawArrays(gl.TRIANGLES, 0, 6)
      frameId = requestAnimationFrame(desenhar)
    }

    desenhar()

    return () => {
      cancelAnimationFrame(frameId)
      gl.deleteProgram(program)
      gl.deleteShader(vertexShader)
      gl.deleteShader(fragmentShader)
      gl.deleteBuffer(buffer)
    }
  }, [color])

  return (
    <div className={`absolute inset-0 h-full w-full overflow-hidden ${className}`}>
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  )
}
