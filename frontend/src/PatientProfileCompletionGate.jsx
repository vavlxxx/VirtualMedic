import { useEffect, useMemo, useRef, useState } from 'react'
import { ApiError } from './api/client'
import { useAuth } from './auth/AuthContext'
import { AvatarCropModal } from './AvatarCropModal'
import { ProfileImage } from './ProfileImage'
import { resolveProfileImageSrc } from './profileImageSupport'

const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024
const allowedAvatarTypes = new Set(['image/png', 'image/jpeg', 'image/webp'])

function isPatientProfileIncomplete(user) {
  if (!user || user.role !== 'patient') {
    return false
  }

  return !user.gender || !user.birth_date
}

function toInputDate(value) {
  return typeof value === 'string' ? value.slice(0, 10) : ''
}

function getDefaultBirthDate() {
  const value = new Date()
  value.setFullYear(value.getFullYear() - 25)
  return value.toISOString().slice(0, 10)
}

function validate({ gender, birthDate }) {
  const errors = {}

  if (!gender) {
    errors.gender = 'Выберите пол'
  }

  if (!birthDate) {
    errors.birthDate = 'Укажите дату рождения'
  } else if (birthDate > new Date().toISOString().slice(0, 10)) {
    errors.birthDate = 'Дата рождения не может быть в будущем'
  }

  return errors
}

export function PatientProfileCompletionGate() {
  const auth = useAuth()
  const shouldShowGate = useMemo(() => isPatientProfileIncomplete(auth.user), [auth.user])

  const [gender, setGender] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [birthDateVisibleToDoctors, setBirthDateVisibleToDoctors] = useState(false)
  const [selectedAvatarFile, setSelectedAvatarFile] = useState(null)
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState('')
  const [cropSourceUrl, setCropSourceUrl] = useState('')
  const [cropSourceFileName, setCropSourceFileName] = useState('')
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [formMessage, setFormMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const avatarInputRef = useRef(null)

  useEffect(() => {
    if (!auth.user) {
      return
    }

    setGender(auth.user.gender || '')
    setBirthDate(toInputDate(auth.user.birth_date) || getDefaultBirthDate())
    setBirthDateVisibleToDoctors(Boolean(auth.user.birth_date_visible_to_doctors))
  }, [auth.user])

  useEffect(() => {
    if (!shouldShowGate) {
      return
    }

    document.body.classList.add('vm-profile-gate-open')

    return () => {
      document.body.classList.remove('vm-profile-gate-open')
    }
  }, [shouldShowGate])

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl)
      }
    }
  }, [avatarPreviewUrl])

  useEffect(() => {
    return () => {
      if (cropSourceUrl) {
        URL.revokeObjectURL(cropSourceUrl)
      }
    }
  }, [cropSourceUrl])

  if (!auth.isReady || !auth.isAuthenticated || !shouldShowGate) {
    return null
  }

  const handleAvatarChange = (event) => {
    const file = event.target.files?.[0]

    if (!file) {
      setSelectedAvatarFile(null)
      setFormError('')
      return
    }

    if (!allowedAvatarTypes.has(file.type)) {
      setFormError('Допустимы только JPG, PNG или WEBP для фото профиля.')
      event.target.value = ''
      return
    }

    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      setFormError('Фото профиля должно быть не больше 2 МБ.')
      event.target.value = ''
      return
    }

    if (avatarPreviewUrl) {
      URL.revokeObjectURL(avatarPreviewUrl)
    }

    if (cropSourceUrl) {
      URL.revokeObjectURL(cropSourceUrl)
    }

    setCropSourceUrl(URL.createObjectURL(file))
    setCropSourceFileName(file.name || 'avatar')
    setFormError('')
  }

  const handleApplyCrop = (croppedFile) => {
    if (avatarPreviewUrl) {
      URL.revokeObjectURL(avatarPreviewUrl)
    }

    setSelectedAvatarFile(croppedFile)
    setAvatarPreviewUrl(URL.createObjectURL(croppedFile))

    if (cropSourceUrl) {
      URL.revokeObjectURL(cropSourceUrl)
      setCropSourceUrl('')
    }

    setCropSourceFileName('')
  }

  const handleCancelCrop = () => {
    if (cropSourceUrl) {
      URL.revokeObjectURL(cropSourceUrl)
      setCropSourceUrl('')
    }

    setCropSourceFileName('')

    if (avatarInputRef.current) {
      avatarInputRef.current.value = ''
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    const nextErrors = validate({ gender, birthDate })
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      return
    }

    setErrors({})
    setFormError('')
    setFormMessage('')
    setIsSubmitting(true)

    try {
      await auth.updateProfile({
        gender,
        birth_date: birthDate,
        birth_date_visible_to_doctors: birthDateVisibleToDoctors,
      })

      if (selectedAvatarFile) {
        await auth.uploadAvatar(selectedAvatarFile)
      }

      setSelectedAvatarFile(null)
      setAvatarPreviewUrl('')
      setCropSourceFileName('')
      setFormMessage('Профиль заполнен. Спасибо!')
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'Не удалось сохранить профиль. Попробуйте ещё раз.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const previewSource = avatarPreviewUrl || resolveProfileImageSrc({
    src: auth.user.avatar_url,
    gender,
  })

  return (
    <div className="vm-profile-gate" role="dialog" aria-modal="true" aria-labelledby="vm-profile-gate-title">
      <div className="vm-profile-gate__backdrop" aria-hidden="true" />
      <section className="vm-profile-gate__card">
        <header className="vm-profile-gate__header">
          <p className="vm-profile-gate__kicker">Завершите профиль</p>
          <h2 id="vm-profile-gate-title">Нужны ещё 2 шага перед использованием платформы</h2>
          <p>
            Укажите пол и дату рождения. Фото можно добавить сейчас или позже, но мы уже подготовим
            вам аккуратный аватар по выбранному полу.
          </p>
        </header>

        <form className="vm-profile-gate__form" onSubmit={handleSubmit} noValidate>
          <div className="vm-profile-gate__row">
            <span className="vm-profile-gate__label">Пол</span>
            <div className="vm-profile-gate__gender-grid">
              <button
                className={`vm-profile-gate__gender-chip ${gender === 'female' ? 'is-active' : ''}`}
                type="button"
                onClick={() => {
                  setGender('female')
                  setErrors((current) => ({ ...current, gender: '' }))
                }}
              >
                Женский
              </button>
              <button
                className={`vm-profile-gate__gender-chip ${gender === 'male' ? 'is-active' : ''}`}
                type="button"
                onClick={() => {
                  setGender('male')
                  setErrors((current) => ({ ...current, gender: '' }))
                }}
              >
                Мужской
              </button>
            </div>
            {errors.gender ? <span className="vm-profile-gate__error">{errors.gender}</span> : null}
          </div>

          <label className="vm-profile-gate__row">
            <span className="vm-profile-gate__label">Дата рождения</span>
            <input
              className={`vm-profile-gate__input ${errors.birthDate ? 'is-error' : ''}`}
              type="date"
              value={birthDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(event) => {
                setBirthDate(event.target.value)
                setErrors((current) => ({ ...current, birthDate: '' }))
              }}
              disabled={isSubmitting}
              required
            />
            {errors.birthDate ? <span className="vm-profile-gate__error">{errors.birthDate}</span> : null}
          </label>

          <label className="vm-profile-gate__row vm-profile-gate__row--checkbox">
            <input
              type="checkbox"
              checked={birthDateVisibleToDoctors}
              onChange={(event) => setBirthDateVisibleToDoctors(event.target.checked)}
              disabled={isSubmitting}
            />
            <span>Показывать мою дату рождения врачам</span>
          </label>

          <div className="vm-profile-gate__row vm-profile-gate__row--avatar">
            <div className="vm-profile-gate__avatar-preview">
              <ProfileImage alt="Предпросмотр фото профиля" src={previewSource} gender={gender} />
            </div>
            <label className="vm-profile-gate__avatar-field">
              <span className="vm-profile-gate__label">Фото профиля (необязательно)</span>
              <input
                ref={avatarInputRef}
                className="vm-profile-gate__avatar-input"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleAvatarChange}
                disabled={isSubmitting}
              />
              <button
                className="vm-profile-gate__avatar-button"
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={isSubmitting}
              >
                {selectedAvatarFile ? 'Изменить фото' : 'Выбрать фото'}
              </button>
              {selectedAvatarFile ? (
                <small className="vm-profile-gate__avatar-meta">
                  Фото подготовлено и будет загружено после сохранения профиля.
                </small>
              ) : null}
              <small>Если фото не загружать, автоматически установим аккуратный дефолтный аватар.</small>
            </label>
          </div>

          {formError ? <div className="vm-profile-gate__error-box">{formError}</div> : null}
          {formMessage ? <div className="vm-profile-gate__success-box">{formMessage}</div> : null}

          <button className="vm-profile-gate__submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Сохраняем профиль...' : 'Сохранить и продолжить'}
          </button>
        </form>
      </section>

      {cropSourceUrl ? (
        <AvatarCropModal
          sourceUrl={cropSourceUrl}
          sourceFileName={cropSourceFileName}
          onApply={handleApplyCrop}
          onCancel={handleCancelCrop}
        />
      ) : null}
    </div>
  )
}
