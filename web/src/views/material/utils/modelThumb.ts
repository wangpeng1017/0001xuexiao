import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'

export const renderModelThumbnail = async (
  url: string,
  size = 512
): Promise<File | null> => {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true
  })
  renderer.setSize(size, size, false)
  renderer.setPixelRatio(1)

  const scene = new THREE.Scene()
  scene.add(new THREE.AmbientLight(0xffffff, 1.4))
  const keyLight = new THREE.DirectionalLight(0xffffff, 2)
  keyLight.position.set(5, 10, 7)
  scene.add(keyLight)
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.8)
  fillLight.position.set(-6, -4, -5)
  scene.add(fillLight)

  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1e9)

  try {
    const gltf = await new GLTFLoader().loadAsync(url)
    const model = gltf.scene
    scene.add(model)

    const box = new THREE.Box3().setFromObject(model)
    const center = box.getCenter(new THREE.Vector3())
    const sphere = box.getBoundingSphere(new THREE.Sphere())
    const radius = Math.max(sphere.radius, 0.001)
    const distance =
      (radius / Math.sin((Math.PI * camera.fov) / 360)) * 1.2 + radius * 0.5

    camera.position.set(
      center.x + distance * 0.8,
      center.y + distance * 0.55,
      center.z + distance * 0.8
    )
    camera.near = Math.max(distance / 10000, 0.0001)
    camera.far = distance * 100
    camera.lookAt(center)
    camera.updateProjectionMatrix()

    renderer.render(scene, camera)
    const blob = await new Promise<Blob | null>(resolve => {
      renderer.domElement.toBlob(resolve, 'image/png')
    })
    if (!blob) return null
    return new File([blob], 'thumb.png', { type: 'image/png' })
  } catch (error) {
    console.warn('模型缩略图渲染失败', error)
    return null
  } finally {
    renderer.dispose()
    renderer.forceContextLoss()
    renderer.domElement.remove()
  }
}
