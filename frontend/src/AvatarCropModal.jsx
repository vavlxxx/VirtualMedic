import { useEffect, useMemo, useRef, useState } from 'react'

const CROP_SIZE_PX = 280
const OUTPUT_SIZE_PX = 512
const MIN_ZOOM = 1
const MAX_ZOOM = 3

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function getMetrics(imageMeta, zoom) {
  if (!imageMeta) {
    return null
  }

  const baseScale = Math.max(CROP_SIZE_PX / imageMeta.width, CROP_SIZE_PX / imageMeta.height)
  const scale = baseScale * zoom
  const drawWidth = imageMeta.width * scale
  const drawHeight = imageMeta.height * scale

  return {
    drawWidth,
    drawHeight,
    limitX: Math.max(0, (drawWidth - CROP_SIZE_PX) / 2),
    limitY: Math.max(0, (drawHeight - CROP_SIZE_PX) / 2),
  }
}

function clampOffset(offset, metrics) {
  if (!metrics) {
    return { x: 0, y: 0 }
  }

  return {
    x: clamp(offset.x, -metrics.limitX, metrics.limitX),
    y: clamp(offset.y, -metrics.limitY, metrics.limitY),
  }
}

function loadImageMeta(sourceUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      resolve({
        element: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
      })
    }
    image.onerror = () => {
      reject(new Error('Не удалось загрузить изображение для обрезки.'))
    }
    image.src = sourceUrl
  })
}

function buildSafeAvatarFileName(name) {
  const baseName = (name || 'avatar')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)

  return `${baseName || 'avatar'}-cropped.jpg`
}

async function renderCroppedBlob({ imageMeta, zoom, offset }) {
  const metrics = getMetrics(imageMeta, zoom)
  if (!metrics) {
    throw new Error('Не удалось подготовить изображение для обрезки.')
  }

  const canvas = document.createElement('canvas')
  canvas.width = OUTPUT_SIZE_PX
  canvas.height = OUTPUT_SIZE_PX

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Не удалось инициализировать обработку изображения.')
  }

  const drawX = (CROP_SIZE_PX - metrics.drawWidth) / 2 + offset.x
  const drawY = (CROP_SIZE_PX - metrics.drawHeight) / 2 + offset.y
  const ratio = OUTPUT_SIZE_PX / CROP_SIZE_PX

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, OUTPUT_SIZE_PX, OUTPUT_SIZE_PX)
  context.drawImage(
    imageMeta.element,
    drawX * ratio,
    drawY * ratio,
    metrics.drawWidth * ratio,
    metrics.drawHeight * ratio,
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Не удалось завершить обрезку фото.'))
          return
        }
        resolve(blob)
      },
      'image/jpeg',
      0.92,
    )
  })
}

export function AvatarCropModal({ sourceUrl, sourceFileName, onApply, onCancel }) {
  const [imageMeta, setImageMeta] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [zoom, setZoom] = useState(1.25)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [error, setError] = useState('')
  const [isApplying, setIsApplying] = useState(false)

  const stageRef = useRef(null)
  const dragRef = useRef(null)

  const metrics = useMemo(() => getMetrics(imageMeta, zoom), [imageMeta, zoom])

  useEffect(() => {
    let isCancelled = false

    const bootstrap = async () => {
      setIsLoading(true)
      setError('')

      try {
        const meta = await loadImageMeta(sourceUrl)
        if (isCancelled) {
          return
        }
        setImageMeta(meta)
        setOffset({ x: 0, y: 0 })
      } catch (loadError) {
        if (!isCancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Не удалось открыть фото.')
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    bootstrap()

    return () => {
      isCancelled = true
    }
  }, [sourceUrl])

  useEffect(() => {
    setOffset((current) => clampOffset(current, metrics))
  }, [metrics])

  const handlePointerDown = (event) => {
    if (!metrics || isLoading || isApplying) {
      return
    }

    event.preventDefault()
    const origin = { x: event.clientX, y: event.clientY }
    const startOffset = { ...offset }

    dragRef.current = {
      pointerId: event.pointerId,
      origin,
      startOffset,
    }

    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId || !metrics) {
      return
    }

    event.preventDefault()
    const deltaX = event.clientX - dragRef.current.origin.x
    const deltaY = event.clientY - dragRef.current.origin.y

    setOffset(
      clampOffset(
        {
          x: dragRef.current.startOffset.x + deltaX,
          y: dragRef.current.startOffset.y + deltaY,
        },
        metrics,
      ),
    )
  }

  const stopDrag = (event) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) {
      return
    }

    if (stageRef.current?.hasPointerCapture(event.pointerId)) {
      stageRef.current.releasePointerCapture(event.pointerId)
    }

    dragRef.current = null
  }

  const handleZoomChange = (event) => {
    setZoom(Number(event.target.value))
  }

  const handleApply = async () => {
    if (!imageMeta) {
      return
    }

    setError('')
    setIsApplying(true)

    try {
      const blob = await renderCroppedBlob({
        imageMeta,
        zoom,
        offset,
      })

      const croppedFile = new File([blob], buildSafeAvatarFileName(sourceFileName), {
        type: 'image/jpeg',
      })

      onApply(croppedFile)
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : 'Не удалось подготовить фото.')
    } finally {
      setIsApplying(false)
    }
  }

  return (
    <div className="vm-avatar-cropper" role="dialog" aria-modal="true" aria-labelledby="vm-avatar-cropper-title">
      <div className="vm-avatar-cropper__backdrop" aria-hidden="true" />
      <section className="vm-avatar-cropper__card">
        <header className="vm-avatar-cropper__header">
          <h3 id="vm-avatar-cropper-title">Обрезка фото профиля</h3>
          <p>Потяните изображение и настройте масштаб. В круг попадёт итоговый аватар.</p>
        </header>

        <div className="vm-avatar-cropper__body">
          {isLoading ? (
            <div className="vm-avatar-cropper__loading">Подготавливаем изображение...</div>
          ) : (
            <>
              <div
                className="vm-avatar-cropper__stage"
                ref={stageRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={stopDrag}
                onPointerCancel={stopDrag}
              >
                {metrics ? (
                  <img
                    alt="Обрезка аватара"
                    className="vm-avatar-cropper__image"
                    src={sourceUrl}
                    style={{
                      width: `${metrics.drawWidth}px`,
                      height: `${metrics.drawHeight}px`,
                      transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                    }}
                    draggable={false}
                  />
                ) : null}
                <div className="vm-avatar-cropper__mask" aria-hidden="true" />
              </div>

              <label className="vm-avatar-cropper__zoom">
                <span>Масштаб</span>
                <input
                  type="range"
                  min={MIN_ZOOM}
                  max={MAX_ZOOM}
                  step="0.01"
                  value={zoom}
                  onChange={handleZoomChange}
                  disabled={isApplying}
                />
              </label>
            </>
          )}

          {error ? <div className="vm-avatar-cropper__error">{error}</div> : null}
        </div>

        <footer className="vm-avatar-cropper__actions">
          <button className="vm-avatar-cropper__button vm-avatar-cropper__button--ghost" type="button" onClick={onCancel}>
            Отмена
          </button>
          <button
            className="vm-avatar-cropper__button vm-avatar-cropper__button--primary"
            type="button"
            onClick={handleApply}
            disabled={isLoading || isApplying || !imageMeta}
          >
            {isApplying ? 'Сохраняем кадр...' : 'Использовать это фото'}
          </button>
        </footer>
      </section>
    </div>
  )
}
