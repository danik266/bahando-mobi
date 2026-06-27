import { StatusBar } from 'expo-status-bar'
import {
  GolosText_400Regular,
  GolosText_600SemiBold,
  GolosText_700Bold,
  GolosText_900Black,
  useFonts,
} from '@expo-google-fonts/golos-text'
import * as ImagePicker from 'expo-image-picker'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

type Role = 'sender' | 'reviewer'
type Status = 'pending' | 'approved' | 'rejected' | 'iiko_error'
type WriteOffType = 'without_deduction' | 'with_deduction'
type ViewMode = 'create' | 'mine' | 'review' | 'history' | 'stats'

type Outlet = {
  id: string
  name: string
  address: string
  city: string
  iikoStoreId: string
}

type Product = {
  id: string
  name: string
  unit: string
  iikoProductId: string
  cost: number
  category: string
}

type Employee = {
  id: string
  name: string
  role: Role
  login: string
  city: string
  outletId: string
  outletIds: string[]
  accessScope: 'assigned' | 'all'
  iikoEmployeeId: string
}

type Reason = {
  id: string
  name: string
}

type AiAnalysisResult = {
  productId: string
  productName: string
  reasonId: string
  quantity: number
  damageType: string
  damageDiscoveredAt: string
  confidence: number
  signs: string[]
  generatedComment: string
}

type WriteOffRequest = {
  id: string
  outletId: string
  productId: string
  quantity: number
  unit: string
  reasonId: string
  type: WriteOffType
  deductionEmployeeId?: string
  comment: string
  photoUrl: string
  photoName: string
  photoHash: string
  extraPhotoUrls?: string[]
  status: Status
  createdById: string
  reviewedById?: string
  rejectionReason?: string
  iikoDocumentId?: string
  iikoStatusMessage?: string
  createdAt: string
  reviewedAt?: string
}

type BootstrapPayload = {
  outlets: Outlet[]
  products: Product[]
  employees: Employee[]
  reasons: Reason[]
  requests: WriteOffRequest[]
  serverTime: string
}

type FormState = {
  outletId: string
  productId: string
  quantity: string
  reasonId: string
  type: WriteOffType
  deductionEmployeeId: string
  deductionReason: string
  comment: string
  photoUrl: string
  photoName: string
  photoHash: string
  extraPhotoUrls: string[]
  damageType: string
  damageDiscoveredAt: string
  productionDate: string
  expiryDate: string
}

const API_URL = normalizeBaseUrl(
  process.env.EXPO_PUBLIC_API_URL ?? 'http://46.101.134.38:4000/api',
)

const FONT = {
  regular: 'GolosText_400Regular',
  semi: 'GolosText_600SemiBold',
  bold: 'GolosText_700Bold',
  black: 'GolosText_900Black',
} as const

const emptyData: BootstrapPayload = {
  outlets: [],
  products: [],
  employees: [],
  reasons: [],
  requests: [],
  serverTime: '',
}

const statusCopy: Record<Status, string> = {
  pending: 'На проверке',
  approved: 'Подтверждено',
  rejected: 'Отклонено',
  iiko_error: 'Ошибка Iiko',
}

const statusColor: Record<Status, string> = {
  pending: '#ff5e12',
  approved: '#0d803d',
  rejected: '#c83c31',
  iiko_error: '#c83c31',
}

const rejectReasons = ['Некачественное фото', 'Недостаточно оснований', 'Обсудим лично']

export default function App() {
  const [fontsLoaded] = useFonts({
    GolosText_400Regular,
    GolosText_600SemiBold,
    GolosText_700Bold,
    GolosText_900Black,
  })
  const [currentUser, setCurrentUser] = useState<Employee | null>(null)
  const [loginName, setLoginName] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [data, setData] = useState<BootstrapPayload>(emptyData)
  const [viewMode, setViewMode] = useState<ViewMode>('create')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState<FormState>(createEmptyForm())
  const [formMode, setFormMode] = useState<'initial' | 'filling'>('initial')
  const [aiHint, setAiHint] = useState('')
  const [aiResult, setAiResult] = useState<AiAnalysisResult | null>(null)
  const [selectedRequestId, setSelectedRequestId] = useState('')
  const [detailRequestId, setDetailRequestId] = useState('')
  const [rejectionDraft, setRejectionDraft] = useState('')
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const [isAddEmployeeVisible, setIsAddEmployeeVisible] = useState(false)
  const [newEmpName, setNewEmpName] = useState('')
  const [newEmpCity, setNewEmpCity] = useState('Астана')
  const [newEmpLogin, setNewEmpLogin] = useState('')
  const [newEmpPin, setNewEmpPin] = useState('')
  const [addEmpError, setAddEmpError] = useState('')

  const [formStep, setFormStep] = useState<'wizard' | 'choose_mode' | 'details'>('wizard')
  const [showPin, setShowPin] = useState(false)

  const selectedProduct = data.products.find((product) => product.id === form.productId)
  const selectedReason = data.reasons.find((reason) => reason.id === form.reasonId)

  const myRequests = useMemo(
    () => data.requests.filter((request) => request.createdById === currentUser?.id),
    [currentUser?.id, data.requests],
  )

  const pendingRequests = useMemo(
    () => data.requests.filter((request) => request.status === 'pending'),
    [data.requests],
  )

  const selectedRequest =
    pendingRequests.find((request) => request.id === selectedRequestId) ?? pendingRequests[0]
  const detailRequest = data.requests.find((request) => request.id === detailRequestId)

  const loadData = useCallback(async (userOverride?: Employee | null) => {
    try {
      setError('')
      const activeUser = userOverride === undefined ? currentUser : userOverride
      const query = activeUser?.id ? `?userId=${encodeURIComponent(activeUser.id)}` : ''
      const payload = await requestJson<BootstrapPayload>(`/bootstrap${query}`)
      setData(payload)
      const nextPendingRequest = payload.requests.find((request) => request.status === 'pending')
      setSelectedRequestId((current) =>
        payload.requests.some((request) => request.id === current && request.status === 'pending')
          ? current
          : nextPendingRequest?.id || '',
      )
      setForm((current) =>
        current.outletId ? current : createDefaultForm(payload, activeUser ?? payload.employees[0]),
      )
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось загрузить данные')
    } finally {
      setIsLoading(false)
    }
  }, [currentUser])

  useEffect(() => {
    void loadData()
  }, [loadData])

  async function login() {
    try {
      setIsSaving(true)
      setAuthError('')
      const result = await requestJson<{ user: Employee; token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ login: loginName, pinCode: password }),
      })
      const query = `?userId=${encodeURIComponent(result.user.id)}`
      const payload = await requestJson<BootstrapPayload>(`/bootstrap${query}`)
      setCurrentUser(result.user)
      setData(payload)
      setViewMode(result.user.role === 'sender' ? 'create' : 'review')
      setSelectedRequestId(payload.requests.find((request) => request.status === 'pending')?.id || '')
      setForm(createDefaultForm(payload, result.user))
      setPassword('')
    } catch (requestError) {
      setAuthError(requestError instanceof Error ? requestError.message : 'Не удалось войти')
    } finally {
      setIsSaving(false)
    }
  }

  function logout() {
    setCurrentUser(null)
    setPassword('')
    setAuthError('')
    setData(emptyData)
    setForm(createEmptyForm())
    setFormMode('initial')
    setAiHint('')
    setAiResult(null)
    setSelectionMode(false)
    setSelectedIds([])
    setDetailRequestId('')
    setViewMode('create')
    setFormStep('wizard')
    setShowPin(false)
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    if (key === 'photoUrl') {
      setAiResult(null)
    }
  }

  async function analyzeCurrentPhoto() {
    if (!form.photoUrl) {
      Alert.alert('Фото', 'Сначала прикрепите фото продукции.')
      return
    }
    if (!form.photoUrl.startsWith('data:image/')) {
      Alert.alert('AI-анализ', 'Для AI-анализа используйте фото с камеры или галереи.')
      return
    }

    try {
      setIsAnalyzing(true)
      const result = await analyzePhoto(form.photoUrl, aiHint, data.products, data.reasons)
      setAiResult(result)
      setForm((current) => ({
        ...current,
        productId: result.productId,
        reasonId: result.reasonId,
        quantity: String(result.quantity || 1),
        damageType: result.damageType || '',
        damageDiscoveredAt: result.damageDiscoveredAt || '',
        comment: result.generatedComment,
      }))
      setFormMode('filling')
    } catch (requestError) {
      Alert.alert(
        'AI-анализ',
        requestError instanceof Error ? requestError.message : 'Не удалось проанализировать фото.',
      )
    } finally {
      setIsAnalyzing(false)
    }
  }

  async function pickCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Камера', 'Разрешите доступ к камере, чтобы прикрепить фото.')
      return
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      base64: true,
      quality: 0.68,
    })
    applyImageResult(result)
  }

  async function pickGallery() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Фото', 'Разрешите доступ к галерее, чтобы прикрепить фото.')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      base64: true,
      quality: 0.68,
    })
    applyImageResult(result)
  }

  function choosePhotoSource() {
    Alert.alert('Фото продукции', 'Откуда добавить фото?', [
      {
        text: 'Камера',
        onPress: () => {
          void pickCamera()
        },
      },
      {
        text: 'Галерея',
        onPress: () => {
          void pickGallery()
        },
      },
      { text: 'Отмена', style: 'cancel' },
    ])
  }

  function applyImageResult(result: ImagePicker.ImagePickerResult) {
    if (result.canceled) return
    const asset = result.assets[0]
    const mimeType = asset.mimeType ?? 'image/jpeg'
    const dataUrl = asset.base64 ? `data:${mimeType};base64,${asset.base64}` : asset.uri
    const name = asset.fileName ?? `writeoff-${Date.now()}.jpg`

    setForm((current) => ({
      ...current,
      photoUrl: dataUrl,
      photoName: name,
      photoHash: `sha256:${simpleHash(`${name}:${asset.uri}:${Date.now()}`)}`,
    }))
    setAiResult(null)
    setFormMode('initial')
  }

  function addExtraPhoto() {
    Alert.alert('Фото продукции', 'Откуда добавить фото?', [
      {
        text: 'Камера',
        onPress: async () => {
          const permission = await ImagePicker.requestCameraPermissionsAsync()
          if (!permission.granted) return
          const result = await ImagePicker.launchCameraAsync({
            allowsEditing: false,
            base64: true,
            quality: 0.68,
          })
          if (!result.canceled) {
            const asset = result.assets[0]
            const mimeType = asset.mimeType ?? 'image/jpeg'
            const dataUrl = asset.base64 ? `data:${mimeType};base64,${asset.base64}` : asset.uri
            setForm((current) => ({
              ...current,
              extraPhotoUrls: [...(current.extraPhotoUrls ?? []), dataUrl],
            }))
          }
        },
      },
      {
        text: 'Галерея',
        onPress: async () => {
          const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
          if (!permission.granted) return
          const result = await ImagePicker.launchImageLibraryAsync({
            allowsEditing: false,
            base64: true,
            quality: 0.68,
          })
          if (!result.canceled) {
            const asset = result.assets[0]
            const mimeType = asset.mimeType ?? 'image/jpeg'
            const dataUrl = asset.base64 ? `data:${mimeType};base64,${asset.base64}` : asset.uri
            setForm((current) => ({
              ...current,
              extraPhotoUrls: [...(current.extraPhotoUrls ?? []), dataUrl],
            }))
          }
        },
      },
      { text: 'Отмена', style: 'cancel' },
    ])
  }

  function submitRequest() {
    if (!currentUser) {
      Alert.alert('Ошибка', 'Сначала авторизуйтесь.')
      return
    }
    const product = data.products.find((item) => item.id === form.productId)
    const quantity = Number(form.quantity)
    const comment = form.comment.trim()

    if (!form.photoUrl) {
      Alert.alert('Фото', 'Прикрепите фото продукции.')
      return
    }
    if (!product || !Number.isFinite(quantity) || quantity <= 0) {
      Alert.alert('Количество', 'Укажите корректный продукт и количество.')
      return
    }
    if (comment.length < 10) {
      Alert.alert('Комментарий', 'Комментарий должен быть не короче 10 символов.')
      return
    }
    if (form.type === 'with_deduction' && !form.deductionEmployeeId) {
      Alert.alert('Удержание', 'Выберите сотрудника для удержания.')
      return
    }

    Alert.alert(
      'Проверить заявку',
      `${product.name}\n${quantity} ${product.unit}\n${selectedReason?.name ?? 'Причина не выбрана'}`,
      [
        { text: 'Назад', style: 'cancel' },
        {
          text: 'Отправить',
          onPress: () => {
            void createRequest(product, quantity, comment)
          },
        },
      ],
    )
  }

  async function createRequest(product: Product, quantity: number, comment: string) {
    if (!currentUser) return

    try {
      setIsSaving(true)
      await requestJson<{ request: WriteOffRequest }>('/requests', {
        method: 'POST',
        body: JSON.stringify({
          outletId: form.outletId,
          productId: product.id,
          quantity,
          reasonId: form.reasonId,
          type: form.type,
          deductionEmployeeId:
            form.type === 'with_deduction' ? form.deductionEmployeeId : undefined,
          comment,
          photoUrl: form.photoUrl,
          photoName: form.photoName,
          photoHash: form.photoHash,
          extraPhotoUrls: form.extraPhotoUrls,
          createdById: currentUser.id,
        }),
      })
      const query = `?userId=${encodeURIComponent(currentUser.id)}`
      const payload = await requestJson<BootstrapPayload>(`/bootstrap${query}`)
      setData(payload)
      setSelectedRequestId(payload.requests[0]?.id || '')
      setForm(createDefaultForm(payload, currentUser))
      setAiHint('')
      setAiResult(null)
      setFormMode('initial')
      setViewMode('mine')
      setFormStep('wizard')
      Alert.alert('Готово', 'Заявка отправлена на проверку.')
    } catch (requestError) {
      Alert.alert(
        'Не удалось отправить',
        requestError instanceof Error ? requestError.message : 'Ошибка API',
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function handleAddEmployee() {
    if (!currentUser) return
    try {
      setIsSaving(true)
      setAddEmpError('')
      await requestJson('/employees', {
        method: 'POST',
        body: JSON.stringify({
          name: newEmpName,
          login: newEmpLogin,
          pinCode: newEmpPin,
          city: newEmpCity,
          createdById: currentUser.id,
        }),
      })
      Alert.alert('Успех', `Сотрудник ${newEmpName} успешно добавлен!`)
      setIsAddEmployeeVisible(false)
      setNewEmpName('')
      setNewEmpLogin('')
      setNewEmpPin('')
      await loadData()
    } catch (err) {
      setAddEmpError(err instanceof Error ? err.message : 'Не удалось добавить сотрудника')
    } finally {
      setIsSaving(false)
    }
  }

  async function approveRequest(requestId: string) {
    if (!currentUser) return
    try {
      setIsSaving(true)
      await requestJson<{ request: WriteOffRequest }>(`/requests/${requestId}/approve`, {
        method: 'PATCH',
        body: JSON.stringify({ reviewedById: currentUser.id }),
      })
      await loadData()
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Ошибка API'
      if (message.toLowerCase().includes('обработана')) {
        await loadData()
      }
      Alert.alert(
        'Не удалось подтвердить',
        message,
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function rejectRequest(requestId: string, reasonOverride?: string) {
    if (!currentUser) return
    const reason = (reasonOverride ?? rejectionDraft).trim()
    if (reason.length < 8) {
      Alert.alert('Отклонение', 'Укажите причину отклонения.')
      return
    }

    try {
      setIsSaving(true)
      await requestJson<{ request: WriteOffRequest }>(`/requests/${requestId}/reject`, {
        method: 'PATCH',
        body: JSON.stringify({ reviewedById: currentUser.id, rejectionReason: reason }),
      })
      setRejectionDraft('')
      await loadData()
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Ошибка API'
      if (message.toLowerCase().includes('обработана')) {
        await loadData()
      }
      Alert.alert(
        'Не удалось отклонить',
        message,
      )
    } finally {
      setIsSaving(false)
    }
  }

  function startSelection(requestId: string) {
    setSelectionMode(true)
    setSelectedIds((current) =>
      current.includes(requestId) ? current : [...current, requestId],
    )
  }

  function toggleSelection(requestId: string) {
    const next = selectedIds.includes(requestId)
      ? selectedIds.filter((id) => id !== requestId)
      : [...selectedIds, requestId]
    setSelectedIds(next)
    setSelectionMode(next.length > 0)
  }

  function clearSelection() {
    setSelectionMode(false)
    setSelectedIds([])
  }

  async function bulkApproveRequests() {
    if (!currentUser || !selectedIds.length) return
    try {
      setIsSaving(true)
      await Promise.all(
        selectedIds.map((requestId) =>
          requestJson<{ request: WriteOffRequest }>(`/requests/${requestId}/approve`, {
            method: 'PATCH',
            body: JSON.stringify({ reviewedById: currentUser.id }),
          }),
        ),
      )
      clearSelection()
      await loadData()
    } catch (requestError) {
      Alert.alert(
        'Массовое подтверждение',
        requestError instanceof Error ? requestError.message : 'Ошибка API',
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}
      >
        {!currentUser && (
          <View style={styles.header}>
            <BahandiLogo />
            <Text style={styles.headerTitle}>SPISANDI</Text>
          </View>
        )}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={() => void loadData()} />
          }
        >
          {!fontsLoaded || isLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color="#0d803d" />
              <Text style={styles.muted}>Загрузка...</Text>
            </View>
          ) : !currentUser ? (
            <LoginScreen
              loginName={loginName}
              password={password}
              authError={authError}
              isSaving={isSaving}
              onLoginNameChange={setLoginName}
              onPasswordChange={setPassword}
              onLogin={login}
            />
          ) : (
            <>
              {/* Green Header Banner */}
              <ImageBackground
                source={require('./assets/cover.png')}
                style={styles.greenBannerContainer}
                imageStyle={styles.greenBannerImage}
              >
                {/* Logo top row */}
                <View style={styles.bannerLogoRow}>
                  <BahandiLogo />
                  <Text style={styles.bannerLogoText}>SPISANDI</Text>
                </View>

                {/* User info row */}
                <View style={styles.bannerUserRow}>
                  <View style={styles.bannerAvatarCircle}>
                    <Text style={styles.bannerAvatarEmoji}>U</Text>
                  </View>
                  <View style={styles.bannerUserInfo}>
                    <Text style={styles.bannerUserName}>{currentUser.name}</Text>
                    <Text style={styles.bannerUserOutlet}>
                      {currentUser.role === 'sender' ? (currentUser.city || 'Bahandi') : 'Bahandi'}
                    </Text>
                  </View>
                  <View style={styles.bannerRolePill}>
                    <Text style={styles.bannerRoleText}>
                      {currentUser.role === 'sender' ? 'Сотрудник' : 'Проверяющий'}
                    </Text>
                  </View>
                </View>

                {/* Logout action */}
                <Pressable style={styles.bannerLogoutBtn} onPress={logout}>
                  <Text style={styles.bannerLogoutIcon}>{'->'}</Text>
                  <Text style={styles.bannerLogoutText}>Выйти</Text>
                </Pressable>
              </ImageBackground>

              {currentUser.role === 'sender' ? (
                <>
                  <View style={styles.tabs}>
                    <TabButton
                      active={viewMode === 'create'}
                      label="Списать"
                      onPress={() => setViewMode('create')}
                    />
                    <TabButton
                      active={viewMode === 'mine'}
                      label="Мои заявки"
                      onPress={() => setViewMode('mine')}
                    />
                  </View>

                  {viewMode === 'create' ? (
                    <SenderForm
                      currentUser={currentUser}
                      data={data}
                      form={form}
                      formMode={formMode}
                      aiHint={aiHint}
                      aiResult={aiResult}
                      isAnalyzing={isAnalyzing}
                      isSaving={isSaving}
                      selectedProduct={selectedProduct}
                      selectedReason={selectedReason}
                      onSetField={setField}
                      onHintChange={setAiHint}
                      onFormModeChange={setFormMode}
                      onAnalyze={analyzeCurrentPhoto}
                      onChoosePhoto={choosePhotoSource}
                      onAddExtraPhoto={addExtraPhoto}
                      onSubmit={submitRequest}
                      formStep={formStep}
                      onFormStepChange={setFormStep}
                    />
                  ) : (
                    <>
                      <Text style={styles.totalRequestsLabel}>Всего заявок: {myRequests.length}</Text>
                      <RequestList
                        requests={myRequests}
                        products={data.products}
                        onSelect={(request) => setDetailRequestId(request.id)}
                      />
                    </>
                  )}
                </>
              ) : (
                <>
                  {currentUser.accessScope === 'all' && (
                    <Pressable
                      style={styles.addEmployeeTopButton}
                      onPress={() => setIsAddEmployeeVisible(true)}
                    >
                      <Text style={styles.addEmployeeTopButtonText}>+ Добавить сотрудника</Text>
                    </Pressable>
                  )}

                  <View style={styles.tabs}>
                    <TabButton
                      active={viewMode === 'review'}
                      label="Проверка"
                      onPress={() => setViewMode('review')}
                    />
                    <TabButton
                      active={viewMode === 'history'}
                      label="История"
                      onPress={() => setViewMode('history')}
                    />
                    <TabButton
                      active={viewMode === 'stats'}
                      label="Статистика"
                      onPress={() => setViewMode('stats')}
                    />
                  </View>

                  {viewMode === 'review' ? (
                    <ReviewerView
                      request={selectedRequest}
                      pendingRequests={pendingRequests}
                      products={data.products}
                      outlets={data.outlets}
                      rejectionDraft={rejectionDraft}
                      isSaving={isSaving}
                      selectionMode={selectionMode}
                      selectedIds={selectedIds}
                      onSelect={setSelectedRequestId}
                      onRejectionChange={setRejectionDraft}
                      onApprove={approveRequest}
                      onReject={rejectRequest}
                      onLongPress={startSelection}
                      onToggleSelect={toggleSelection}
                      onBulkApprove={bulkApproveRequests}
                      onClearSelection={clearSelection}
                    />
                  ) : viewMode === 'history' ? (
                    <RequestList
                      requests={data.requests}
                      products={data.products}
                      onSelect={(request) => setDetailRequestId(request.id)}
                    />
                  ) : (
                    <StatsView
                      requests={data.requests}
                      products={data.products}
                      outlets={data.outlets}
                      employees={data.employees}
                      reasons={data.reasons}
                    />
                  )}
                </>
              )}
            </>
          )}
        </ScrollView>

        <RequestDetailModal
          request={detailRequest}
          products={data.products}
          outlets={data.outlets}
          reasons={data.reasons}
          employees={data.employees}
          onClose={() => setDetailRequestId('')}
        />

        <AddEmployeeModal
          visible={isAddEmployeeVisible}
          onClose={() => { setIsAddEmployeeVisible(false); setAddEmpError('') }}
          name={newEmpName}
          onNameChange={setNewEmpName}
          city={newEmpCity}
          onCityChange={setNewEmpCity}
          login={newEmpLogin}
          onLoginChange={setNewEmpLogin}
          pin={newEmpPin}
          onPinChange={setNewEmpPin}
          onSave={handleAddEmployee}
          isSaving={isSaving}
          error={addEmpError}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function LoginScreen({
  loginName,
  password,
  authError,
  isSaving,
  onLoginNameChange,
  onPasswordChange,
  onLogin,
}: {
  loginName: string
  password: string
  authError: string
  isSaving: boolean
  onLoginNameChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onLogin: () => void
}) {
  const [showPin, setShowPin] = useState(false)

  return (
    <View style={styles.loginContainer}>
      <Text style={styles.loginWelcomeTitle}>Добро пожаловать!</Text>
      <Text style={styles.loginWelcomeSubtitle}>
        Войдите личным логином{"\n"}и пин-кодом.
      </Text>

      {/* Login input box */}
      <Text style={styles.loginFieldLabel}>Логин</Text>
      <View style={styles.loginInputWrapper}>
        <Text style={styles.loginInputIcon}>@</Text>
        <TextInput
          value={loginName}
          onChangeText={onLoginNameChange}
          placeholder="aibek"
          placeholderTextColor="#999"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.loginTextInput}
        />
        {loginName.length > 0 && (
          <Pressable onPress={() => onLoginNameChange('')} style={styles.loginInputClearBtn}>
            <Text style={styles.loginInputClearText}>x</Text>
          </Pressable>
        )}
      </View>

      {/* PIN code input box */}
      <Text style={styles.loginFieldLabel}>Пин-код</Text>
      <View style={styles.loginInputWrapper}>
        <Text style={styles.loginInputIcon}>*</Text>
        <TextInput
          value={password}
          onChangeText={onPasswordChange}
          placeholder="••••"
          placeholderTextColor="#999"
          keyboardType="numeric"
          secureTextEntry={!showPin}
          style={styles.loginTextInput}
        />
        <Pressable onPress={() => setShowPin(!showPin)} style={styles.loginInputEyeBtn}>
          <Text style={styles.loginInputEyeText}>{showPin ? 'скрыть' : 'показать'}</Text>
        </Pressable>
      </View>

      {authError ? (
        <View style={styles.loginErrorBoxInline}>
          <Text style={styles.loginErrorText}>{authError}</Text>
        </View>
      ) : null}

      {/* Submit Button */}
      <Pressable
        disabled={isSaving}
        style={[styles.loginSubmitButton, isSaving && styles.disabledButton]}
        onPress={onLogin}
      >
        <Text style={styles.loginSubmitText}>Войти</Text>
        <View style={styles.loginSubmitArrowCircle}>
          {isSaving ? (
            <ActivityIndicator size="small" color="#006c35" />
          ) : (
            <Text style={styles.loginSubmitArrowText}>{'->'}</Text>
          )}
        </View>
      </Pressable>

      {/* Demo Accounts Panel */}
      <View style={styles.demoPanel}>
        <View style={styles.demoHeaderRow}>
          <Text style={styles.demoTitle}>Демо-аккаунт</Text>
          <Text style={styles.demoInfoIcon}>(i)</Text>
        </View>
        <Text style={styles.demoBodyText}>
          aibek/1234  ·  aigerim/9999{"\n"}
          manager/0000  ·  madina/2222{"\n"}
          timur/3333
        </Text>
      </View>

      {/* Footer message */}
      <View style={styles.loginFooter}>
        <Text style={styles.loginFooterIcon}>[i]</Text>
        <Text style={styles.loginFooterText}>
          По вопросам доступа{"\n"}обратитесь к администратору.
        </Text>
      </View>
    </View>
  )
}

function SenderForm({
  currentUser,
  data,
  form,
  formMode,
  aiHint,
  aiResult,
  isAnalyzing,
  isSaving,
  selectedProduct,
  selectedReason,
  onSetField,
  onHintChange,
  onFormModeChange,
  onAnalyze,
  onChoosePhoto,
  onAddExtraPhoto,
  onSubmit,
  formStep,
  onFormStepChange,
}: {
  currentUser: Employee | null
  data: BootstrapPayload
  form: FormState
  formMode: 'initial' | 'filling'
  aiHint: string
  aiResult: AiAnalysisResult | null
  isAnalyzing: boolean
  isSaving: boolean
  selectedProduct?: Product
  selectedReason?: Reason
  onSetField: <K extends keyof FormState>(key: K, value: FormState[K]) => void
  onHintChange: (value: string) => void
  onFormModeChange: (mode: 'initial' | 'filling') => void
  onAnalyze: () => void
  onChoosePhoto: () => void
  onAddExtraPhoto: () => void
  onSubmit: () => void
  formStep: 'wizard' | 'choose_mode' | 'details'
  onFormStepChange: (step: 'wizard' | 'choose_mode' | 'details') => void
}) {
  const progress = calculateFormProgress(form, selectedReason)
  const quantity = Number(form.quantity)
  const reasonName = selectedReason?.name.toLowerCase() ?? ''
  const needsExpiry = reasonName.includes('срок') || reasonName.includes('проср')
  const needsDamage = reasonName.includes('повреж') || reasonName.includes('порч')
  
  const cost = selectedProduct ? selectedProduct.cost : 0
  const totalCostAmount = selectedProduct && quantity > 0 ? quantity * selectedProduct.cost : 0

  const activeOutletName = data.outlets.find((o) => o.id === form.outletId)?.name || 'Bahandi'

  const canProceedToDetails = form.photoUrl && aiHint.trim().length > 0
  const canSubmit = progress >= 100 && !isSaving

  // Outlet options filtered by employee's city
  const cityOutlets = data.outlets.filter((o) => o.city === currentUser?.city)

  const renderDetailsFields = () => {
    return (
      <View style={{ gap: 16 }}>
        {/* Product search input */}
        <Text style={styles.wizardFieldLabel}>Выберите продукт</Text>
        <ProductSearch
          products={data.products}
          value={form.productId}
          onChange={(val) => onSetField('productId', val)}
        />

        {/* Quantity entry */}
        <Text style={styles.wizardFieldLabel}>Количество</Text>
        <View style={styles.detailsQuantityRow}>
          <TextInput
            keyboardType="decimal-pad"
            value={form.quantity}
            onChangeText={(value) => {
              // Разрешаем только цифры и одну точку
              const cleaned = value.replace(/,/g, '.').replace(/[^0-9.]/g, '');
              const parts = cleaned.split('.');
              const finalVal = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : cleaned;
              onSetField('quantity', finalVal);
            }}
            placeholder="0"
            style={styles.detailsQuantityInput}
          />
          <View style={styles.detailsUnitBadge}>
            <Text style={styles.detailsUnitBadgeText}>{selectedProduct?.unit ?? 'шт'}</Text>
          </View>
        </View>

        {/* Reason selector chips */}
        <Text style={styles.wizardFieldLabel}>Причина списания</Text>
        <View style={styles.reasonsChipsContainer}>
          {data.reasons.map((item) => {
            const isSelected = form.reasonId === item.id
            return (
              <Pressable
                key={item.id}
                style={[
                  styles.reasonChipItem,
                  isSelected && styles.reasonChipItemActive,
                ]}
                onPress={() => onSetField('reasonId', item.id)}
              >
                <Text style={[styles.reasonChipText, isSelected && styles.reasonChipTextActive]}>
                  {item.name}
                </Text>
                {isSelected && (
                  <View style={styles.reasonChipCheckDot} />
                )}
              </Pressable>
            )
          })}
        </View>

        {/* Cost grid side-by-side cards */}
        <View style={styles.costCardsRow}>
          <View style={styles.costCard}>
            <Text style={styles.costCardLabel}>Себестоимость</Text>
            <Text style={styles.costCardValue}>{formatMoney(cost)}</Text>
          </View>
          <View style={styles.costCard}>
            <Text style={styles.costCardLabel}>Итого к списанию</Text>
            <Text style={[styles.costCardValue, { color: '#097a3a' }]}>
              {formatMoney(totalCostAmount)}
            </Text>
          </View>
        </View>

        {/* Dates fields if required */}
        {needsExpiry && (
          <View style={styles.expiryGrid}>
            <View style={styles.expiryInputGroup}>
              <Text style={styles.wizardFieldLabel}>Дата производства</Text>
              <TextInput
                value={form.productionDate}
                onChangeText={(value) => onSetField('productionDate', value)}
                placeholder="2026-06-25"
                style={styles.wizardTextInput}
              />
            </View>
            <View style={styles.expiryInputGroup}>
              <Text style={styles.wizardFieldLabel}>Годен до</Text>
              <TextInput
                value={form.expiryDate}
                onChangeText={(value) => onSetField('expiryDate', value)}
                placeholder="2026-06-27"
                style={styles.wizardTextInput}
              />
            </View>
          </View>
        )}

        {/* Damage fields if required */}
        {needsDamage && (
          <View style={styles.damageBox}>
            <Text style={styles.wizardFieldLabel}>Вид повреждения</Text>
            <ChipGrid
              items={[
                { id: 'Помято' },
                { id: 'Упало' },
                { id: 'Порвана упаковка' },
                { id: 'Прочее' },
              ]}
              value={form.damageType}
              getLabel={(item) => item.id}
              onChange={(value) => onSetField('damageType', value)}
            />

            <Text style={styles.wizardFieldLabel}>Когда обнаружено</Text>
            <ChipGrid
              items={[
                { id: 'При приемке' },
                { id: 'При хранении' },
                { id: 'В процессе готовки' },
                { id: 'Прочее' },
              ]}
              value={form.damageDiscoveredAt}
              getLabel={(item) => item.id}
              onChange={(value) => onSetField('damageDiscoveredAt', value)}
            />
          </View>
        )}

        {/* Deduction Toggle segmented container */}
        <View style={styles.deductionToggleSegmented}>
          <Pressable
            style={[
              styles.deductionToggleBtn,
              form.type === 'without_deduction' && styles.deductionToggleBtnActive,
            ]}
            onPress={() => onSetField('type', 'without_deduction')}
          >
            <Text
              style={[
                styles.deductionToggleText,
                form.type === 'without_deduction' && styles.deductionToggleTextActive,
              ]}
            >
              Без удержания
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.deductionToggleBtn,
              form.type === 'with_deduction' && styles.deductionToggleBtnActive,
            ]}
            onPress={() => onSetField('type', 'with_deduction')}
          >
            <Text
              style={[
                styles.deductionToggleText,
                form.type === 'with_deduction' && styles.deductionToggleTextActive,
              ]}
            >
              С удержанием
            </Text>
          </Pressable>
        </View>

        {/* Deduction items */}
        {form.type === 'with_deduction' && (
          <View style={styles.deductionFieldsContainer}>
            <Text style={styles.wizardFieldLabel}>Сотрудник для удержания</Text>
            <View style={styles.deductionEmployeeSelector}>
              {form.deductionEmployeeId ? (
                <View style={styles.deductionEmployeeChip}>
                  <Text style={styles.deductionEmployeeChipIcon}>u</Text>
                  <Text style={styles.deductionEmployeeChipText}>
                    {data.employees.find((e) => e.id === form.deductionEmployeeId)?.name || 'Выбран'}
                  </Text>
                  <Pressable
                    onPress={() => onSetField('deductionEmployeeId', '')}
                    style={styles.deductionEmployeeChipClear}
                  >
                    <Text style={styles.deductionEmployeeChipClearText}>x</Text>
                  </Pressable>
                </View>
              ) : (
                <ChipGrid
                  items={data.employees.filter((employee) => employee.role === 'sender')}
                  value={form.deductionEmployeeId}
                  getLabel={(item) => item.name}
                  onChange={(value) => onSetField('deductionEmployeeId', value)}
                />
              )}
            </View>

            <Text style={styles.wizardFieldLabel}>Причина удержания</Text>
            <TextInput
              value={form.deductionReason}
              onChangeText={(value) => onSetField('deductionReason', value)}
              placeholder="Например: халатность"
              placeholderTextColor="#999"
              style={styles.wizardTextInput}
            />
          </View>
        )}

        {/* General Comment */}
        <Text style={styles.wizardFieldLabel}>Комментарий</Text>
        <TextInput
          value={form.comment}
          onChangeText={(value) => onSetField('comment', value)}
          placeholder="Например: булочки повреждены при приемке"
          placeholderTextColor="#999"
          multiline
          style={styles.detailsCommentInput}
        />

        {/* Submit Button */}
        <Pressable
          disabled={!canSubmit}
          style={[styles.detailsSubmitBtn, !canSubmit && styles.disabledButton]}
          onPress={onSubmit}
        >
          {isSaving ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.detailsSubmitText}>Отправить на проверку</Text>
          )}
        </Pressable>
      </View>
    )
  }

  if (formStep === 'wizard') {
    return (
      <View style={styles.wizardContainer}>
        {/* Outlet selector for sender */}
        {cityOutlets.length > 1 && (
          <View style={styles.outletSelectorBox}>
            <Text style={styles.wizardFieldLabel}>Выберите точку</Text>
            <View style={styles.outletChipsRow}>
              {cityOutlets.map((o) => (
                <Pressable
                  key={o.id}
                  style={[
                    styles.outletChip,
                    form.outletId === o.id && styles.outletChipActive,
                  ]}
                  onPress={() => onSetField('outletId', o.id)}
                >
                  <Text
                    style={[
                      styles.outletChipText,
                      form.outletId === o.id && styles.outletChipTextActive,
                    ]}
                    numberOfLines={2}
                  >
                    {o.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Mode choice card */}
        <Text style={styles.wizardSectionTitle}>Новая заявка на списание</Text>
        <Text style={styles.wizardSectionSub}>{activeOutletName}</Text>

        <View style={styles.modeCardsRow}>
          {/* Manual mode card */}
          <Pressable
            style={styles.modeCard}
            onPress={() => onFormStepChange('details')}
          >
            <View style={[styles.modeCardIconBox, { backgroundColor: '#fff3e0' }]}>
              <View style={styles.modeCardIconLines}>
                <View style={[styles.modeIconLine, { width: 28 }]} />
                <View style={[styles.modeIconLine, { width: 20 }]} />
                <View style={[styles.modeIconLine, { width: 24 }]} />
              </View>
            </View>
            <Text style={styles.modeCardTitle}>Вручную</Text>
            <Text style={styles.modeCardDesc}>Заполните форму самостоятельно</Text>
          </Pressable>

          {/* AI mode card */}
          <Pressable
            style={styles.modeCard}
            onPress={() => onFormStepChange('choose_mode')}
          >
            <View style={[styles.modeCardIconBox, { backgroundColor: '#e8f5e9' }]}>
              <View style={styles.modeCardAiBrain}>
                <View style={styles.modeCardAiCircle} />
                <View style={styles.modeCardAiDot} />
                <View style={[styles.modeCardAiLine, { width: 20 }]} />
                <View style={[styles.modeCardAiLine, { width: 14 }]} />
              </View>
            </View>
            <Text style={styles.modeCardTitle}>С ИИ</Text>
            <Text style={styles.modeCardDesc}>ИИ заполнит по фото</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  // AI Mode: photo + hint
  if (formStep === 'choose_mode') {
    return (
      <View style={styles.wizardContainer}>
        <Pressable onPress={() => onFormStepChange('wizard')} style={styles.detailsBackBtn}>
          <Text style={styles.detailsBackText}>{'<'} Назад</Text>
        </Pressable>

        <Text style={styles.wizardSectionTitle}>Анализ с ИИ</Text>
        <Text style={styles.wizardSectionSub}>Сфотографируйте товар — ИИ определит продукт и причину</Text>

        {/* Photo upload block */}
        <View style={styles.aiPhotoBlock}>
          <View style={{ position: 'relative' }}>
            <Pressable onPress={onChoosePhoto} style={styles.aiPhotoPressable}>
              {form.photoUrl ? (
                <Image source={{ uri: form.photoUrl }} style={styles.aiPhotoPreview} />
              ) : (
                <View style={styles.aiPhotoPlaceholder}>
                  <CameraIcon />
                  <Text style={styles.aiPhotoPlaceholderText}>Нажмите чтобы добавить фото</Text>
                </View>
              )}
              {!form.photoUrl && (
                <View style={styles.aiPhotoPlusBadge}>
                  <Text style={styles.aiPhotoPlusText}>+</Text>
                </View>
              )}
            </Pressable>
            {form.photoUrl ? (
              <Pressable
                onPress={() => {
                  onSetField('photoUrl', '')
                  onSetField('photoName', '')
                  onSetField('photoHash', '')
                  onHintChange('')
                }}
                style={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: 'rgba(0, 0, 0, 0.6)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 10,
                }}
              >
                <Text style={{ color: '#fff', fontSize: 16, fontFamily: FONT.bold, marginTop: -2 }}>x</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Hint input */}
        <Text style={styles.wizardFieldLabel}>Описание (подсказка для ИИ)</Text>
        <TextInput
          value={aiHint}
          onChangeText={onHintChange}
          placeholder="Например: помялось, истек срок, упало"
          placeholderTextColor="#999"
          style={styles.wizardTextInput}
        />

        {aiResult && <AiResultCard result={aiResult} />}

        {/* Analyze button: disabled if analyzed or no photo */}
        {!aiResult && (
          <Pressable
            disabled={!form.photoUrl || isAnalyzing}
            style={[styles.wizardProceedBtn, (!form.photoUrl || isAnalyzing) && styles.disabledButton]}
            onPress={onAnalyze}
          >
            {isAnalyzing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.wizardProceedText}>Анализировать фото</Text>
            )}
          </Pressable>
        )}

        {/* Render Form fields inline directly below AI result card if analyzed */}
        {aiResult && (
          <View style={{ marginTop: 8 }}>
            {renderDetailsFields()}
          </View>
        )}
      </View>
    )
  }

  // Details form step (Manual Mode Step 2)
  return (
    <View style={styles.detailsContainer}>
      {/* Back button only */}
      <Pressable onPress={() => onFormStepChange('wizard')} style={styles.detailsBackBtn}>
        <Text style={styles.detailsBackText}>{'<-'} Назад</Text>
      </Pressable>

      {/* Photo upload — mandatory for both modes */}
      <Text style={styles.wizardFieldLabel}>Фото товара <Text style={{ color: '#e53e3e' }}>*</Text></Text>
      <View style={{ position: 'relative' }}>
        <Pressable onPress={onChoosePhoto} style={styles.detailsPhotoBlock}>
          {form.photoUrl ? (
            <Image source={{ uri: form.photoUrl }} style={styles.detailsPhotoImage} />
          ) : (
            <View style={styles.detailsPhotoEmpty}>
              <View style={styles.detailsPhotoCameraBox}>
                <CameraIcon />
              </View>
              <Text style={styles.detailsPhotoEmptyText}>Нажмите, чтобы добавить фото</Text>
            </View>
          )}
        </Pressable>
        {form.photoUrl ? (
          <Pressable
            onPress={() => {
              onSetField('photoUrl', '')
              onSetField('photoName', '')
              onSetField('photoHash', '')
            }}
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontFamily: FONT.bold, marginTop: -2 }}>x</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Extra photos strip */}
      {form.photoUrl ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.extraPhotosRow}>
          {(form.extraPhotoUrls ?? []).map((uri, idx) => (
            <View key={idx} style={styles.extraPhotoThumb}>
              <Image source={{ uri }} style={styles.extraPhotoThumbImg} />
              <Pressable
                style={styles.extraPhotoRemoveBtn}
                onPress={() => onSetField('extraPhotoUrls', (form.extraPhotoUrls ?? []).filter((_, i) => i !== idx))}
              >
                <Text style={styles.extraPhotoRemoveText}>x</Text>
              </Pressable>
            </View>
          ))}
          <Pressable onPress={onAddExtraPhoto} style={styles.extraPhotoAddBtn}>
            <Text style={styles.extraPhotoAddText}>+{'\n'}фото</Text>
          </Pressable>
        </ScrollView>
      ) : null}

      {renderDetailsFields()}
    </View>
  )
}

function ReviewerView({
  request,
  pendingRequests,
  products,
  outlets,
  rejectionDraft,
  isSaving,
  selectionMode,
  selectedIds,
  onSelect,
  onRejectionChange,
  onApprove,
  onReject,
  onLongPress,
  onToggleSelect,
  onBulkApprove,
  onClearSelection,
}: {
  request?: WriteOffRequest
  pendingRequests: WriteOffRequest[]
  products: Product[]
  outlets: Outlet[]
  rejectionDraft: string
  isSaving: boolean
  selectionMode: boolean
  selectedIds: string[]
  onSelect: (id: string) => void
  onRejectionChange: (value: string) => void
  onApprove: (id: string) => void
  onReject: (id: string, reason?: string) => void
  onLongPress: (id: string) => void
  onToggleSelect: (id: string) => void
  onBulkApprove: () => void
  onClearSelection: () => void
}) {
  if (!request) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyTitle}>Очередь пуста</Text>
      </View>
    )
  }

  const product = products.find((item) => item.id === request.productId)
  const outlet = outlets.find((item) => item.id === request.outletId)
  const amount = product ? request.quantity * product.cost : 0

  return (
    <View style={styles.reviewPanel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>Очередь проверки</Text>
        <Text style={styles.panelDetail}>pending · {pendingRequests.length}</Text>
      </View>

      {selectedIds.length > 0 ? (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionText}>Выбрано: {selectedIds.length}</Text>
          <View style={styles.selectionActions}>
            <Pressable style={styles.selectionGhost} onPress={onClearSelection}>
              <Text style={styles.selectionGhostText}>Снять</Text>
            </Pressable>
            <Pressable
              disabled={isSaving}
              style={[styles.selectionApprove, isSaving && styles.disabledButton]}
              onPress={onBulkApprove}
            >
              <Text style={styles.selectionApproveText}>Подтвердить</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={styles.queueList}>
        {pendingRequests.map((item) => (
          <ReviewerQueueCard
            key={item.id}
            request={item}
            product={products.find((productItem) => productItem.id === item.productId)}
            outlet={outlets.find((outletItem) => outletItem.id === item.outletId)}
            active={item.id === request.id}
            selected={selectedIds.includes(item.id)}
            selectionMode={selectionMode}
            onPress={() => (selectionMode ? onToggleSelect(item.id) : onSelect(item.id))}
            onLongPress={() => onLongPress(item.id)}
          />
        ))}
      </View>

      <Image source={{ uri: request.photoUrl }} style={styles.reviewPhoto} />
      <Text style={styles.reviewTitle}>#{request.id} · {product?.name ?? 'Продукт'}</Text>
      <Text style={styles.requestMeta}>{outlet?.name ?? 'Bahandi'}</Text>
      <Text style={styles.reviewInfo}>
        {request.quantity} {request.unit} · {request.type === 'with_deduction' ? 'с удержанием' : 'без удержания'}
      </Text>
      {product ? (
        <Text style={styles.requestMeta}>{formatMoney(amount)} по себестоимости</Text>
      ) : null}
      <Text style={styles.commentText}>{request.comment}</Text>

      <Text style={styles.label}>Причина отклонения</Text>
      <TextInput
        value={rejectionDraft}
        onChangeText={onRejectionChange}
        placeholder="Например: фото не подтверждает количество"
        multiline
        style={[styles.input, styles.commentInput]}
      />

      <View style={styles.quickReasonGrid}>
        {rejectReasons.map((reason) => (
          <Pressable
            key={reason}
            style={styles.quickReasonChip}
            onPress={() => onRejectionChange(reason)}
            onLongPress={() => onReject(request.id, reason)}
          >
            <Text style={styles.quickReasonText}>{reason}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.actionRow}>
        <Pressable
          disabled={isSaving}
          style={[styles.rejectButton, isSaving && styles.disabledButton]}
          onPress={() => onReject(request.id)}
        >
          <Text style={styles.rejectText}>Отклонить</Text>
        </Pressable>
        <Pressable
          disabled={isSaving}
          style={[styles.approveButton, isSaving && styles.disabledButton]}
          onPress={() => onApprove(request.id)}
        >
          <Text style={styles.approveText}>Подтвердить</Text>
        </Pressable>
      </View>
    </View>
  )
}

function FormProgress({ percent }: { percent: number }) {
  return (
    <View style={styles.progressBox}>
      <View style={styles.progressHead}>
        <Text style={styles.progressLabel}>Заполнение заявки</Text>
        <Text style={styles.progressValue}>{percent}%</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${percent}%` as `${number}%` }]} />
      </View>
    </View>
  )
}

function CostSummary({
  product,
  quantity,
}: {
  product?: Product
  quantity: number
}) {
  const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 0
  const amount = product ? product.cost * safeQuantity : 0

  return (
    <View style={styles.costBox}>
      <View>
        <Text style={styles.costLabel}>Себестоимость</Text>
        <Text style={styles.costValue}>{product ? formatMoney(product.cost) : '0 KZT'}</Text>
      </View>
      <View>
        <Text style={styles.costLabel}>Итого</Text>
        <Text style={styles.costValue}>{formatMoney(amount)}</Text>
      </View>
    </View>
  )
}

function AiResultCard({ result }: { result: AiAnalysisResult }) {
  return (
    <View style={styles.aiResultBox}>
      <View style={styles.aiResultHead}>
        <Text style={styles.aiResultTitle}>AI заполнил заявку</Text>
        <Text style={styles.aiConfidence}>{formatConfidence(result.confidence)}</Text>
      </View>
      <Text style={styles.aiResultText}>
        {result.productName} · {result.quantity} шт
      </Text>
      {result.signs.length ? (
        <Text style={styles.aiSigns}>{result.signs.slice(0, 3).join(' · ')}</Text>
      ) : null}
    </View>
  )
}

function ReviewerQueueCard({
  request,
  product,
  outlet,
  active,
  selected,
  selectionMode,
  onPress,
  onLongPress,
}: {
  request: WriteOffRequest
  product?: Product
  outlet?: Outlet
  active: boolean
  selected: boolean
  selectionMode: boolean
  onPress: () => void
  onLongPress: () => void
}) {
  return (
    <Pressable
      style={[
        styles.queueCard,
        active && styles.queueCardActive,
        selected && styles.queueCardSelected,
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      <View style={styles.queueCardBody}>
        <Text style={styles.queueTitle}>#{request.id} · {product?.name ?? 'Продукт'}</Text>
        <Text style={styles.requestMeta}>{outlet?.name ?? 'Bahandi'}</Text>
        <Text style={styles.requestMeta}>
          {request.quantity} {request.unit} · {new Date(request.createdAt).toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>
      {selectionMode ? (
        <View style={[styles.selectDot, selected && styles.selectDotActive]}>
          {selected ? <Text style={styles.selectDotText}>v</Text> : null}
        </View>
      ) : null}
    </Pressable>
  )
}

function RequestList({
  requests,
  products,
  onSelect,
}: {
  requests: WriteOffRequest[]
  products: Product[]
  onSelect?: (request: WriteOffRequest) => void
}) {
  return (
    <View style={styles.requestList}>
      {requests.map((request) => (
        <RequestCard
          key={request.id}
          request={request}
          productName={
            products.find((product) => product.id === request.productId)?.name ?? 'Продукт'
          }
          onPress={onSelect ? () => onSelect(request) : undefined}
        />
      ))}
      {!requests.length ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>Заявок пока нет</Text>
        </View>
      ) : null}
    </View>
  )
}

function CameraIcon() {
  return (
    <View style={styles.aiCameraIcon}>
      <View style={styles.aiCameraBody}>
        <View style={styles.aiCameraLens} />
      </View>
      <View style={styles.aiCameraTop} />
    </View>
  )
}

function BahandiLogo() {
  return (
    <View style={styles.logo}>
      <View style={[styles.logoStripe, styles.logoStripeLeft]} />
      <View style={styles.logoBlackLine} />
      <Text style={styles.logoText}>BAHANDI</Text>
      <View style={[styles.logoStripe, styles.logoStripeRight]} />
    </View>
  )
}

function TabButton({
  active,
  label,
  onPress,
  icon,
}: {
  active: boolean
  label: string
  onPress: () => void
  icon?: string
}) {
  return (
    <Pressable style={[styles.tabButton, active && styles.tabButtonActive]} onPress={onPress}>
      {icon ? (
        <Text style={[styles.tabText, active && styles.tabTextActive, { marginRight: 4 }]}>
          {icon}
        </Text>
      ) : null}
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  )
}

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.secondaryButton} onPress={onPress}>
      <Text style={styles.secondaryText}>{label}</Text>
    </Pressable>
  )
}

function ChipGrid<T extends { id: string }>({
  items,
  value,
  getLabel,
  onChange,
}: {
  items: T[]
  value: string
  getLabel: (item: T) => string
  onChange: (id: string) => void
}) {
  return (
    <View style={styles.chipGrid}>
      {items.map((item) => {
        const active = item.id === value
        return (
          <Pressable
            key={item.id}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onChange(item.id)}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {getLabel(item)}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function ProductSearch({
  products,
  value,
  onChange,
}: {
  products: Product[]
  value: string
  onChange: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const selected = products.find((p) => p.id === value)

  const filtered = query.trim()
    ? products.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
    : products

  function selectProduct(id: string) {
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  return (
    <View>
      <TextInput
        value={open ? query : (selected?.name ?? '')}
        onChangeText={(text) => {
          setQuery(text)
          setOpen(true)
        }}
        onFocus={() => {
          setOpen(true)
          setQuery('')
        }}
        placeholder="Начните вводить название..."
        style={styles.input}
        returnKeyType="search"
      />
      {open && (
        <View style={styles.productDropdown}>
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.productDropdownScroll}>
            {filtered.length === 0 ? (
              <Text style={styles.productDropdownEmpty}>Ничего не найдено</Text>
            ) : (
              filtered.map((p) => (
                <Pressable
                  key={p.id}
                  style={[styles.productDropdownItem, p.id === value && styles.productDropdownItemActive]}
                  onPress={() => selectProduct(p.id)}
                >
                  <Text style={[styles.productDropdownText, p.id === value && styles.productDropdownTextActive]}>
                    {p.name}
                  </Text>
                  <Text style={styles.productDropdownUnit}>{p.unit}</Text>
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>
      )}
    </View>
  )
}

function RequestCard({
  request,
  productName,
  onPress,
}: {
  request: WriteOffRequest
  productName: string
  onPress?: () => void
}) {
  const formattedDate = useMemo(() => {
    try {
      const d = new Date(request.createdAt)
      const day = String(d.getDate()).padStart(2, '0')
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const year = d.getFullYear()
      return `${day}.${month}.${year}`
    } catch {
      return request.createdAt
    }
  }, [request.createdAt])

  return (
    <Pressable
      disabled={!onPress}
      style={[styles.requestCard, onPress && styles.requestCardInteractive]}
      onPress={onPress}
    >
      <Image source={{ uri: request.photoUrl }} style={styles.requestPhoto} />
      <View style={styles.requestBody}>
        <Text style={styles.requestTitle} numberOfLines={1}>
          #{request.id} · {productName}
        </Text>
        <Text style={styles.requestMeta}>
          {request.quantity} {request.unit} · {formattedDate}
        </Text>
        <View style={styles.requestStatusBadgeRow}>
          <View style={[styles.statusBadge, { backgroundColor: `${statusColor[request.status]}10`, borderColor: `${statusColor[request.status]}30` }]}>
            <Text style={[styles.statusText, { color: statusColor[request.status] }]}>
              {statusCopy[request.status]}
            </Text>
          </View>
        </View>
      </View>
      <Text style={styles.requestChevron}>{'>'}</Text>
    </Pressable>
  )
}

type StatsTab = 'outlets' | 'employees' | 'reasons'

function StatsView({
  requests,
  products,
  outlets,
  employees,
  reasons,
}: {
  requests: WriteOffRequest[]
  products: Product[]
  outlets: Outlet[]
  employees: Employee[]
  reasons: Reason[]
}) {
  const [activeTab, setActiveTab] = useState<StatsTab>('outlets')

  // Helper to find product cost
  const getProductCost = (productId: string) => {
    return products.find((p) => p.id === productId)?.cost ?? 0
  }

  // Pre-calculate requests statistics
  const approvedRequests = useMemo(() => requests.filter((r) => r.status === 'approved'), [requests])
  
  const totalSum = useMemo(() => {
    return approvedRequests.reduce((sum, r) => sum + r.quantity * getProductCost(r.productId), 0)
  }, [approvedRequests, products])

  const totalCount = requests.length
  const approvedCount = approvedRequests.length
  const rejectedCount = useMemo(() => requests.filter((r) => r.status === 'rejected').length, [requests])
  const pendingCount = useMemo(() => requests.filter((r) => r.status === 'pending').length, [requests])
  
  const avgRequestSum = approvedCount > 0 ? totalSum / approvedCount : 0

  const deductionsSum = useMemo(() => {
    return approvedRequests
      .filter((r) => r.type === 'with_deduction')
      .reduce((sum, r) => sum + r.quantity * getProductCost(r.productId), 0)
  }, [approvedRequests, products])

  // Aggregate by Outlets
  const outletStats = useMemo(() => {
    const map: Record<string, number> = {}
    approvedRequests.forEach((r) => {
      const val = r.quantity * getProductCost(r.productId)
      map[r.outletId] = (map[r.outletId] || 0) + val
    })
    return outlets
      .map((o) => ({
        id: o.id,
        name: o.name,
        city: o.city,
        amount: map[o.id] || 0,
      }))
      .filter((item) => item.amount > 0)
      .sort((a, b) => b.amount - a.amount)
  }, [approvedRequests, outlets, products])

  // Aggregate by Senders (Employees)
  const employeeStats = useMemo(() => {
    const map: Record<string, number> = {}
    approvedRequests.forEach((r) => {
      const val = r.quantity * getProductCost(r.productId)
      map[r.createdById] = (map[r.createdById] || 0) + val
    })
    return employees
      .map((e) => ({
        id: e.id,
        name: e.name,
        role: e.role,
        amount: map[e.id] || 0,
      }))
      .filter((item) => item.amount > 0)
      .sort((a, b) => b.amount - a.amount)
  }, [approvedRequests, employees, products])

  // Aggregate by Reasons
  const reasonStats = useMemo(() => {
    const map: Record<string, number> = {}
    approvedRequests.forEach((r) => {
      const val = r.quantity * getProductCost(r.productId)
      map[r.reasonId] = (map[r.reasonId] || 0) + val
    })
    return reasons
      .map((res) => ({
        id: res.id,
        name: res.name,
        amount: map[res.id] || 0,
      }))
      .filter((item) => item.amount > 0)
      .sort((a, b) => b.amount - a.amount)
  }, [approvedRequests, reasons, products])

  // Max value for progress bar normalization
  const maxAmount = useMemo(() => {
    if (activeTab === 'outlets') return outletStats[0]?.amount ?? 1
    if (activeTab === 'employees') return employeeStats[0]?.amount ?? 1
    return reasonStats[0]?.amount ?? 1
  }, [activeTab, outletStats, employeeStats, reasonStats])

  return (
    <View style={styles.statsContainer}>
      <Text style={styles.statsTitleHeader}>Сводные данные (утверждено)</Text>

      {/* Grid of KPI cards */}
      <View style={styles.kpiGrid}>
        <View style={[styles.kpiCard, { borderColor: '#22c55e' }]}>
          <Text style={styles.kpiLabel}>Сумма списаний</Text>
          <Text style={[styles.kpiValue, { color: '#15803d' }]}>{formatMoney(totalSum)}</Text>
        </View>

        <View style={[styles.kpiCard, { borderColor: '#ef4444' }]}>
          <Text style={styles.kpiLabel}>Сумма удержаний</Text>
          <Text style={[styles.kpiValue, { color: '#b91c1c' }]}>{formatMoney(deductionsSum)}</Text>
        </View>
      </View>

      <View style={styles.kpiGrid}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Среднее списание</Text>
          <Text style={styles.kpiValue}>{formatMoney(avgRequestSum)}</Text>
        </View>

        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Всего заявок</Text>
          <Text style={styles.kpiValue}>{totalCount} шт</Text>
          <Text style={styles.kpiSubText}>
            Утв: {approvedCount} · Откл: {rejectedCount} · Ожид: {pendingCount}
          </Text>
        </View>
      </View>

      {/* Sub-tabs switch */}
      <View style={styles.statsSegmented}>
        <Pressable
          style={[styles.statsTabBtn, activeTab === 'outlets' && styles.statsTabBtnActive]}
          onPress={() => setActiveTab('outlets')}
        >
          <Text style={[styles.statsTabText, activeTab === 'outlets' && styles.statsTabTextActive]}>
            По точкам
          </Text>
        </Pressable>
        <Pressable
          style={[styles.statsTabBtn, activeTab === 'employees' && styles.statsTabBtnActive]}
          onPress={() => setActiveTab('employees')}
        >
          <Text style={[styles.statsTabText, activeTab === 'employees' && styles.statsTabTextActive]}>
            Сотрудники
          </Text>
        </Pressable>
        <Pressable
          style={[styles.statsTabBtn, activeTab === 'reasons' && styles.statsTabBtnActive]}
          onPress={() => setActiveTab('reasons')}
        >
          <Text style={[styles.statsTabText, activeTab === 'reasons' && styles.statsTabTextActive]}>
            Причины
          </Text>
        </Pressable>
      </View>

      {/* Charts / List */}
      <View style={styles.chartPanel}>
        {activeTab === 'outlets' && (
          <>
            {outletStats.length === 0 ? (
              <Text style={styles.emptyStatsText}>Нет данных по точкам</Text>
            ) : (
              outletStats.map((item) => {
                const pct = maxAmount > 0 ? (item.amount / maxAmount) * 100 : 0
                return (
                  <View key={item.id} style={styles.chartItem}>
                    <View style={styles.chartItemHeader}>
                      <Text style={styles.chartItemName}>{item.name}</Text>
                      <Text style={styles.chartItemValue}>{formatMoney(item.amount)}</Text>
                    </View>
                    <Text style={styles.chartItemSubText}>{item.city}</Text>
                    <View style={styles.progressBarBg}>
                      <View style={[styles.progressBarFill, { width: `${pct}%`, backgroundColor: '#3b82f6' }]} />
                    </View>
                  </View>
                )
              })
            )}
          </>
        )}

        {activeTab === 'employees' && (
          <>
            {employeeStats.length === 0 ? (
              <Text style={styles.emptyStatsText}>Нет данных по сотрудникам</Text>
            ) : (
              employeeStats.map((item) => {
                const pct = maxAmount > 0 ? (item.amount / maxAmount) * 100 : 0
                return (
                  <View key={item.id} style={styles.chartItem}>
                    <View style={styles.chartItemHeader}>
                      <Text style={styles.chartItemName}>{item.name}</Text>
                      <Text style={styles.chartItemValue}>{formatMoney(item.amount)}</Text>
                    </View>
                    <Text style={styles.chartItemSubText}>
                      {item.role === 'sender' ? 'Сотрудник' : 'Проверяющий'}
                    </Text>
                    <View style={styles.progressBarBg}>
                      <View style={[styles.progressBarFill, { width: `${pct}%`, backgroundColor: '#10b981' }]} />
                    </View>
                  </View>
                )
              })
            )}
          </>
        )}

        {activeTab === 'reasons' && (
          <>
            {reasonStats.length === 0 ? (
              <Text style={styles.emptyStatsText}>Нет данных по причинам</Text>
            ) : (
              reasonStats.map((item) => {
                const pct = maxAmount > 0 ? (item.amount / maxAmount) * 100 : 0
                return (
                  <View key={item.id} style={styles.chartItem}>
                    <View style={styles.chartItemHeader}>
                      <Text style={styles.chartItemName}>{item.name}</Text>
                      <Text style={styles.chartItemValue}>{formatMoney(item.amount)}</Text>
                    </View>
                    <View style={styles.progressBarBg}>
                      <View style={[styles.progressBarFill, { width: `${pct}%`, backgroundColor: '#f59e0b' }]} />
                    </View>
                  </View>
                )
              })
            )}
          </>
        )}
      </View>
    </View>
  )
}

const CITIES = [
  'Астана',
  'Алматы',
  'Усть-Каменогорск',
  'Шымкент',
  'Караганда',
  'Актау',
  'Атырау',
  'Кокшетау',
  'Костанай',
  'Тараз',
  'Актобе',
]

function AddEmployeeModal({
  visible,
  onClose,
  name,
  onNameChange,
  city,
  onCityChange,
  login,
  onLoginChange,
  pin,
  onPinChange,
  onSave,
  isSaving,
  error,
}: {
  visible: boolean
  onClose: () => void
  name: string
  onNameChange: (val: string) => void
  city: string
  onCityChange: (val: string) => void
  login: string
  onLoginChange: (val: string) => void
  pin: string
  onPinChange: (val: string) => void
  onSave: () => void
  isSaving: boolean
  error: string
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.detailSheet}>
          <ScrollView contentContainerStyle={styles.detailContent} keyboardShouldPersistTaps="handled">
            <View style={styles.detailTitleRow}>
              <Text style={styles.detailTitle}>Новый сотрудник</Text>
              <Pressable onPress={onClose} style={{ padding: 8 }}>
                <Text style={styles.detailCloseText}>x</Text>
              </Pressable>
            </View>

            <Text style={styles.label}>ФИО сотрудника</Text>
            <TextInput
              value={name}
              onChangeText={onNameChange}
              placeholder="Иван Иванов"
              style={styles.input}
            />

            <Text style={styles.label}>Город</Text>
            <ChipGrid
              items={CITIES.map((c) => ({ id: c }))}
              value={city}
              getLabel={(item) => item.id}
              onChange={(val) => onCityChange(val)}
            />

            <Text style={styles.label}>Логин</Text>
            <TextInput
              value={login}
              onChangeText={onLoginChange}
              placeholder="ivan"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />

            <Text style={styles.label}>Пин-код (4–6 цифр)</Text>
            <TextInput
              value={pin}
              onChangeText={onPinChange}
              placeholder="1111"
              keyboardType="numeric"
              maxLength={6}
              secureTextEntry
              style={styles.input}
            />

            {error ? (
              <View style={styles.errorBoxInline}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.addEmpActions}>
              <Pressable style={styles.secondaryButton} onPress={onClose}>
                <Text style={styles.secondaryText}>Отмена</Text>
              </Pressable>
              <Pressable
                disabled={isSaving}
                style={[styles.submitButton, isSaving && styles.disabledButton, styles.addEmpSaveBtn]}
                onPress={onSave}
              >
                {isSaving ? <ActivityIndicator color="#ffffff" /> : null}
                <Text style={styles.submitText}>Сохранить</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

function RequestDetailModal({
  request,
  products,
  outlets,
  reasons,
  employees,
  onClose,
}: {
  request?: WriteOffRequest
  products: Product[]
  outlets: Outlet[]
  reasons: Reason[]
  employees: Employee[]
  onClose: () => void
}) {
  const [activePhoto, setActivePhoto] = useState(request?.photoUrl ?? '')

  useEffect(() => {
    if (request) {
      setActivePhoto(request.photoUrl)
    }
  }, [request])

  const product = request
    ? products.find((item) => item.id === request.productId)
    : undefined
  const outlet = request
    ? outlets.find((item) => item.id === request.outletId)
    : undefined
  const reason = request
    ? reasons.find((item) => item.id === request.reasonId)
    : undefined
  const sender = request
    ? employees.find((item) => item.id === request.createdById)
    : undefined
  const reviewer = request?.reviewedById
    ? employees.find((item) => item.id === request.reviewedById)
    : undefined
  const amount = product && request ? product.cost * request.quantity : 0

  return (
    <Modal
      visible={Boolean(request)}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.detailSheet}>
          {request ? (
            <ScrollView contentContainerStyle={styles.detailContent}>
              <Image source={{ uri: activePhoto || request.photoUrl }} style={styles.detailPhoto} />
              
              {request.extraPhotoUrls && request.extraPhotoUrls.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginTop: 8, marginBottom: 8, paddingHorizontal: 4 }}>
                  <Pressable onPress={() => setActivePhoto(request.photoUrl)}>
                    <Image
                      source={{ uri: request.photoUrl }}
                      style={[
                        { width: 68, height: 68, borderRadius: 10, marginRight: 8, borderWidth: 2, borderColor: '#e2e8f0' },
                        (activePhoto === request.photoUrl || !activePhoto) && { borderColor: '#0d803d' }
                      ]}
                    />
                  </Pressable>
                  {request.extraPhotoUrls.map((uri, idx) => (
                    <Pressable key={idx} onPress={() => setActivePhoto(uri)}>
                      <Image
                        source={{ uri }}
                        style={[
                          { width: 68, height: 68, borderRadius: 10, marginRight: 8, borderWidth: 2, borderColor: '#e2e8f0' },
                          activePhoto === uri && { borderColor: '#0d803d' }
                        ]}
                      />
                    </Pressable>
                  ))}
                </ScrollView>
              )}

              <View style={styles.detailTitleRow}>
                <View style={styles.detailTitleText}>
                  <Text style={styles.detailKicker}>Заявка #{request.id}</Text>
                  <Text style={styles.detailTitle}>{product?.name ?? 'Продукт'}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: `${statusColor[request.status]}18` }]}>
                  <Text style={[styles.statusText, { color: statusColor[request.status] }]}>
                    {statusCopy[request.status]}
                  </Text>
                </View>
              </View>

              <View style={styles.detailGrid}>
                <DetailItem label="Точка" value={outlet?.name ?? 'Bahandi'} />
                <DetailItem label="Адрес" value={outlet?.address ?? 'Адрес не указан'} />
                <DetailItem label="Количество" value={`${request.quantity} ${request.unit}`} />
                <DetailItem label="Сумма" value={formatMoney(amount)} />
                <DetailItem label="Причина" value={reason?.name ?? 'Не указана'} />
                <DetailItem
                  label="Тип"
                  value={request.type === 'with_deduction' ? 'С удержанием' : 'Без удержания'}
                />
                <DetailItem label="Отправил" value={sender?.name ?? request.createdById} />
                <DetailItem
                  label="Создано"
                  value={new Date(request.createdAt).toLocaleString('ru-RU')}
                />
                {reviewer ? <DetailItem label="Проверил" value={reviewer.name} /> : null}
                {request.reviewedAt ? (
                  <DetailItem
                    label="Проверено"
                    value={new Date(request.reviewedAt).toLocaleString('ru-RU')}
                  />
                ) : null}
              </View>

              <View style={styles.detailNote}>
                <Text style={styles.detailNoteLabel}>Комментарий</Text>
                <Text style={styles.detailNoteText}>{request.comment || 'Нет комментария'}</Text>
              </View>

              {request.rejectionReason ? (
                <View style={styles.detailRejectNote}>
                  <Text style={styles.detailRejectLabel}>Причина отклонения</Text>
                  <Text style={styles.detailRejectText}>{request.rejectionReason}</Text>
                </View>
              ) : null}

              {request.iikoStatusMessage ? (
                <View style={styles.detailNote}>
                  <Text style={styles.detailNoteLabel}>Iiko</Text>
                  <Text style={styles.detailNoteText}>{request.iikoStatusMessage}</Text>
                </View>
              ) : null}

              <Pressable style={styles.detailCloseButton} onPress={onClose}>
                <Text style={styles.detailCloseText}>Закрыть</Text>
              </Pressable>
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  )
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailItem}>
      <Text style={styles.detailItemLabel}>{label}</Text>
      <Text style={styles.detailItemValue}>{value}</Text>
    </View>
  )
}

async function analyzePhoto(
  photoBase64: string,
  hint: string,
  products: Product[],
  reasons: Reason[],
): Promise<AiAnalysisResult> {
  const data = await requestJson<{
    productId: string
    productName: string
    reasonId: string
    quantity: number
    damageType: string
    damageDiscoveredAt: string
    comment: string
    confidence: number
    signs: string[]
  }>('/ai/analyze', {
    method: 'POST',
    body: JSON.stringify({
      photoBase64,
      hint,
      products: products.map((product) => ({
        id: product.id,
        name: product.name,
        category: product.category,
      })),
      reasons: reasons.map((reason) => ({ id: reason.id, name: reason.name })),
    }),
  })

  return {
    productId: data.productId,
    productName: data.productName,
    reasonId: data.reasonId,
    quantity: data.quantity,
    damageType: data.damageType,
    damageDiscoveredAt: data.damageDiscoveredAt,
    confidence: data.confidence,
    signs: data.signs,
    generatedComment: data.comment,
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const fetchOptions: RequestInit = {
    method: init?.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  }

  if (init?.body !== undefined) {
    fetchOptions.body = init.body
  }

  const response = await fetch(`${API_URL}${path}`, fetchOptions)

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(payload?.error ?? `API error ${response.status}`)
  }

  return response.json() as Promise<T>
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '')
}

function calculateFormProgress(form: FormState, reason?: Reason) {
  const quantity = Number(form.quantity)
  const reasonName = reason?.name.toLowerCase() ?? ''
  let completedFields = 0
  let totalFields = 6

  if (form.photoUrl) completedFields += 1
  if (form.outletId) completedFields += 1
  if (form.productId) completedFields += 1
  if (Number.isFinite(quantity) && quantity > 0) completedFields += 1
  if (form.reasonId) completedFields += 1
  if (form.comment.trim().length >= 10) completedFields += 1

  if (reasonName.includes('срок') || reasonName.includes('проср')) {
    totalFields += 2
    if (form.productionDate) completedFields += 1
    if (form.expiryDate) completedFields += 1
  }

  if (reasonName.includes('повреж') || reasonName.includes('порч')) {
    totalFields += 2
    if (form.damageType) completedFields += 1
    if (form.damageDiscoveredAt) completedFields += 1
  }

  if (form.type === 'with_deduction') {
    totalFields += 2
    if (form.deductionEmployeeId) completedFields += 1
    if (form.deductionReason) completedFields += 1
  }

  return Math.min(100, Math.round((completedFields / totalFields) * 100))
}

function formatMoney(value: number) {
  return `${Math.round(value).toLocaleString('ru-RU')} KZT`
}

function formatConfidence(value: number) {
  const percent = value <= 1 ? value * 100 : value
  return `${Math.round(percent)}%`
}

function createDefaultForm(data: BootstrapPayload, sender?: Employee): FormState {
  const cityOutlets = sender?.city
    ? data.outlets.filter((o) => o.city === sender.city)
    : data.outlets
  const preferredOutletId =
    sender?.outletIds?.find((id) => cityOutlets.some((o) => o.id === id)) ??
    sender?.outletId ??
    cityOutlets[0]?.id
  const outlet = data.outlets.find((item) => item.id === preferredOutletId) ?? cityOutlets[0]
  return {
    outletId: outlet?.id ?? '',
    productId: '',
    quantity: '',
    reasonId: '',
    type: 'without_deduction',
    deductionEmployeeId: '',
    comment: '',
    photoUrl: '',
    photoName: '',
    photoHash: '',
    extraPhotoUrls: [],
    damageType: '',
    damageDiscoveredAt: '',
    productionDate: '',
    expiryDate: '',
    deductionReason: '',
  }
}

function createEmptyForm(): FormState {
  return {
    outletId: '',
    productId: '',
    quantity: '1',
    reasonId: '',
    type: 'without_deduction',
    deductionEmployeeId: '',
    comment: '',
    photoUrl: '',
    photoName: '',
    photoHash: '',
    extraPhotoUrls: [],
    damageType: '',
    damageDiscoveredAt: '',
    productionDate: '',
    expiryDate: '',
    deductionReason: '',
  }
}

function simpleHash(input: string) {
  let hash = 0
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash).toString(16).padStart(8, '0')
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  keyboard: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: '#ffffff',
    borderBottomColor: '#dee2e6',
    borderBottomWidth: 1,
  },
  logo: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    width: 190,
    height: 54,
    overflow: 'hidden',
    borderWidth: 6,
    borderColor: '#292929',
    backgroundColor: '#0d803d',
  },
  logoBlackLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 17,
    height: 14,
    backgroundColor: '#292929',
  },
  logoStripe: {
    position: 'absolute',
    zIndex: 2,
    top: 19,
    width: 40,
    height: 12,
    backgroundColor: '#ff5e12',
  },
  logoStripeLeft: {
    left: 0,
  },
  logoStripeRight: {
    right: 0,
  },
  logoText: {
    zIndex: 3,
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '900',
    fontFamily: FONT.black,
    letterSpacing: 0,
  },
  headerTitle: {
    color: '#292929',
    fontSize: 20,
    fontWeight: '600',
    fontFamily: FONT.semi,
    letterSpacing: 0,
  },
  content: {
    gap: 14,
    padding: 14,
    paddingBottom: 40,
  },
  errorBox: {
    margin: 14,
    marginBottom: 0,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#fff0ee',
  },
  errorText: {
    color: '#c83c31',
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  userSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 74,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#0d803d',
  },
  userSummaryText: {
    flex: 1,
    gap: 5,
  },
  greenLabel: {
    color: 'rgba(255,255,255,0.76)',
    fontSize: 14.4,
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  rolePill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  rolePillText: {
    color: '#ffffff',
    fontSize: 14.4,
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  greenValue: {
    color: '#ffffff',
    fontSize: 19.2,
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  tabs: {
    flexDirection: 'row',
    gap: 5,
    padding: 5,
    borderRadius: 10,
    backgroundColor: '#f8f8f8',
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: 6,
  },
  tabButtonActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#201c18',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  tabText: {
    color: 'rgba(0, 0, 0, 0.5)',
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  tabTextActive: {
    color: '#292929',
  },
  loadingBox: {
    alignItems: 'center',
    gap: 10,
    padding: 24,
  },
  muted: {
    color: 'rgba(0, 0, 0, 0.5)',
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  loginPanel: {
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dee2e6',
    backgroundColor: '#ffffff',
  },
  loginTitle: {
    color: '#292929',
    fontSize: 32,
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  loginCopy: {
    color: 'rgba(0, 0, 0, 0.5)',
    fontSize: 17.6,
    fontWeight: '600',
    fontFamily: FONT.semi,
    lineHeight: 24,
  },
  loginUser: {
    width: '48%',
    minHeight: 72,
    justifyContent: 'center',
    gap: 4,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dee2e6',
    backgroundColor: '#f8f8f8',
  },
  loginUserActive: {
    borderColor: '#0d803d',
    backgroundColor: '#e8f6ed',
  },
  loginUserName: {
    color: '#292929',
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  loginUserRole: {
    color: 'rgba(0, 0, 0, 0.5)',
    fontSize: 14.4,
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  errorBoxInline: {
    padding: 10,
    borderRadius: 14,
    backgroundColor: '#fff0ee',
  },
  logoutButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cecece',
    backgroundColor: '#ffffff',
  },
  logoutText: {
    color: '#292929',
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  form: {
    gap: 12,
  },
  panelHeader: {
    gap: 4,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dee2e6',
    backgroundColor: '#ffffff',
  },
  panelTitle: {
    color: '#292929',
    fontSize: 19.2,
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  panelDetail: {
    color: 'rgba(0, 0, 0, 0.5)',
    fontSize: 14.4,
    fontFamily: FONT.regular,
  },
  progressBox: {
    gap: 8,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dee2e6',
    backgroundColor: '#ffffff',
  },
  progressHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressLabel: {
    color: '#292929',
    fontSize: 14.4,
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  progressValue: {
    color: '#0d803d',
    fontSize: 14.4,
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  progressTrack: {
    height: 7,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: '#e8f6ed',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#0d803d',
  },
  wizardBox: {
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dee2e6',
    backgroundColor: '#ffffff',
  },
  photoBox: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 250,
    overflow: 'hidden',
    borderRadius: 14,
    backgroundColor: '#f8f8f8',
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  photo: {
    width: '100%',
    height: 250,
  },
  photoPlaceholder: {
    color: 'rgba(0, 0, 0, 0.5)',
    fontSize: 17.6,
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  secondaryButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cecece',
    backgroundColor: '#ffffff',
  },
  secondaryText: {
    color: '#292929',
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  hashText: {
    color: 'rgba(0, 0, 0, 0.5)',
    fontSize: 14.4,
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  label: {
    color: 'rgba(0, 0, 0, 0.5)',
    fontSize: 14.4,
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dee2e6',
    backgroundColor: '#ffffff',
  },
  chipActive: {
    borderColor: '#0d803d',
    backgroundColor: '#e8f6ed',
  },
  chipText: {
    color: '#292929',
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  chipTextActive: {
    color: '#0d803d',
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  inputGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  inputGroup: {
    flex: 1,
    gap: 6,
  },
  input: {
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cecece',
    backgroundColor: '#ffffff',
    color: '#212529',
    fontSize: 17.6,
    fontFamily: FONT.regular,
  },
  commentInput: {
    minHeight: 110,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  segmented: {
    flexDirection: 'row',
    gap: 5,
    padding: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dee2e6',
    backgroundColor: '#f8f8f8',
  },
  costBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dee2e6',
    backgroundColor: '#ffffff',
  },
  costLabel: {
    color: 'rgba(0, 0, 0, 0.5)',
    fontSize: 14.4,
    fontFamily: FONT.regular,
  },
  costValue: {
    color: '#292929',
    fontSize: 17.6,
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  aiResultBox: {
    gap: 6,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#a9ddba',
    backgroundColor: '#e8f6ed',
  },
  aiResultHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  aiResultTitle: {
    color: '#0d803d',
    fontSize: 17.6,
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  aiConfidence: {
    color: '#0d803d',
    fontSize: 14.4,
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  aiResultText: {
    color: '#292929',
    fontSize: 17.6,
    fontFamily: FONT.regular,
  },
  aiSigns: {
    color: 'rgba(0, 0, 0, 0.5)',
    fontSize: 14.4,
    fontFamily: FONT.regular,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    borderRadius: 10,
    backgroundColor: '#0d803d',
  },
  disabledButton: {
    opacity: 0.72,
  },
  submitText: {
    color: '#ffffff',
    fontSize: 19.2,
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  requestList: {
    gap: 10,
  },
  reviewPanel: {
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dee2e6',
    backgroundColor: '#ffffff',
  },
  selectionBar: {
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#a9ddba',
    backgroundColor: '#e8f6ed',
  },
  selectionText: {
    color: '#0d803d',
    fontSize: 17.6,
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  selectionActions: {
    flexDirection: 'row',
    gap: 8,
  },
  selectionGhost: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#a9ddba',
    backgroundColor: '#ffffff',
  },
  selectionGhostText: {
    color: '#0d803d',
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  selectionApprove: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: '#0d803d',
  },
  selectionApproveText: {
    color: '#ffffff',
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  queueList: {
    gap: 8,
  },
  queueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dee2e6',
    backgroundColor: '#ffffff',
  },
  queueCardActive: {
    borderColor: '#0d803d',
  },
  queueCardSelected: {
    backgroundColor: '#e8f6ed',
    borderColor: '#0d803d',
  },
  queueCardBody: {
    flex: 1,
    gap: 3,
  },
  queueTitle: {
    color: '#292929',
    fontSize: 17.6,
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  selectDot: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
    height: 26,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#0d803d',
    backgroundColor: '#ffffff',
  },
  selectDotActive: {
    backgroundColor: '#0d803d',
  },
  selectDotText: {
    color: '#ffffff',
    fontWeight: '700',
    fontFamily: FONT.bold,
  },
  reviewPhoto: {
    width: '100%',
    height: 240,
    borderRadius: 14,
    backgroundColor: '#f8f8f8',
  },
  reviewTitle: {
    color: '#292929',
    fontSize: 19.2,
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  reviewInfo: {
    color: '#292929',
    fontSize: 17.6,
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  commentText: {
    padding: 12,
    borderRadius: 14,
    color: '#292929',
    backgroundColor: '#e8f6ed',
    fontSize: 17.6,
    fontWeight: '600',
    fontFamily: FONT.semi,
    lineHeight: 24,
  },
  quickReasonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickReasonChip: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ffc3a7',
    backgroundColor: '#fff0e8',
  },
  quickReasonText: {
    color: '#ff5e12',
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  approveButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: '#0d803d',
  },
  approveText: {
    color: '#ffffff',
    fontSize: 19.2,
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  rejectButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: '#fff0ee',
    borderWidth: 1,
    borderColor: '#f0b6b0',
  },
  rejectText: {
    color: '#c83c31',
    fontSize: 19.2,
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  requestCard: {
    flexDirection: 'row',
    gap: 10,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dee2e6',
    backgroundColor: '#ffffff',
  },
  requestCardInteractive: {
    shadowColor: '#201c18',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  requestPhoto: {
    width: 76,
    height: 76,
    borderRadius: 10,
    backgroundColor: '#f8f8f8',
  },
  requestBody: {
    flex: 1,
    gap: 4,
    justifyContent: 'center',
  },
  requestTitle: {
    color: '#292929',
    fontSize: 17.6,
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  requestMeta: {
    color: 'rgba(0, 0, 0, 0.5)',
    fontSize: 14.4,
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 14.4,
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 160,
    borderRadius: 14,
    backgroundColor: '#ffffff',
  },
  emptyTitle: {
    color: 'rgba(0, 0, 0, 0.5)',
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  detailSheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: '#ffffff',
  },
  detailContent: {
    gap: 12,
    padding: 14,
    paddingBottom: 28,
  },
  detailPhoto: {
    width: '100%',
    height: 240,
    borderRadius: 14,
    backgroundColor: '#f8f8f8',
  },
  detailTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  detailTitleText: {
    flex: 1,
    gap: 4,
  },
  detailKicker: {
    color: 'rgba(0, 0, 0, 0.5)',
    fontSize: 14.4,
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  detailTitle: {
    color: '#292929',
    fontSize: 22,
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  detailItem: {
    width: '48.7%',
    gap: 5,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dee2e6',
    backgroundColor: '#f8f8f8',
  },
  detailItemLabel: {
    color: 'rgba(0, 0, 0, 0.5)',
    fontSize: 14.4,
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  detailItemValue: {
    color: '#292929',
    fontSize: 17.6,
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  detailNote: {
    gap: 6,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#e8f6ed',
  },
  detailNoteLabel: {
    color: '#0d803d',
    fontSize: 14.4,
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  detailNoteText: {
    color: '#292929',
    fontSize: 17.6,
    fontFamily: FONT.regular,
    lineHeight: 24,
  },
  detailRejectNote: {
    gap: 6,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#fff0ee',
  },
  detailRejectLabel: {
    color: '#c83c31',
    fontSize: 14.4,
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  detailRejectText: {
    color: '#292929',
    fontSize: 17.6,
    fontFamily: FONT.regular,
    lineHeight: 24,
  },
  detailCloseButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    borderRadius: 10,
    backgroundColor: '#0d803d',
  },
  detailCloseText: {
    color: '#ffffff',
    fontSize: 19.2,
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  productDropdown: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dee2e6',
    backgroundColor: '#ffffff',
    marginTop: 4,
    overflow: 'hidden',
    zIndex: 99,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  productDropdownScroll: {
    maxHeight: 240,
  },
  productDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  productDropdownItemActive: {
    backgroundColor: '#f0faf4',
  },
  productDropdownText: {
    fontSize: 16,
    fontFamily: FONT.regular,
    color: '#292929',
    flex: 1,
  },
  productDropdownTextActive: {
    color: '#0d803d',
    fontFamily: FONT.semi,
  },
  productDropdownUnit: {
    fontSize: 13,
    fontFamily: FONT.regular,
    color: '#999',
    marginLeft: 8,
  },
  productDropdownEmpty: {
    padding: 16,
    textAlign: 'center',
    color: '#999',
    fontFamily: FONT.regular,
    fontSize: 15,
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  quantityInput: {
    flex: 1,
  },
  unitBadge: {
    height: 50,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dee2e6',
    backgroundColor: '#f4f4f4',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
  },
  unitBadgeText: {
    fontSize: 16,
    fontFamily: FONT.semi,
    color: '#555',
  },
  addEmployeeTopButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 45,
    borderRadius: 10,
    backgroundColor: '#1a1a2e',
    marginTop: 8,
  },
  addEmployeeTopButtonText: {
    fontFamily: FONT.semi,
    fontSize: 15,
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  addEmpActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    alignItems: 'center',
  },
  addEmpSaveBtn: {
    flex: 1,
    marginTop: 0,
  },
  statsContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 16,
  },
  statsTitleHeader: {
    fontSize: 18,
    fontFamily: FONT.bold,
    color: '#1a1a2e',
    marginBottom: 4,
  },
  kpiGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  kpiCard: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dee2e6',
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  kpiLabel: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: '#666666',
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 16,
    fontFamily: FONT.bold,
    color: '#1a1a2e',
  },
  kpiSubText: {
    fontSize: 10,
    fontFamily: FONT.regular,
    color: '#999999',
    marginTop: 4,
  },
  statsSegmented: {
    flexDirection: 'row',
    backgroundColor: '#f1f3f5',
    borderRadius: 10,
    padding: 2,
    marginTop: 8,
  },
  statsTabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  statsTabBtnActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  statsTabText: {
    fontSize: 13,
    fontFamily: FONT.semi,
    color: '#495057',
  },
  statsTabTextActive: {
    color: '#1a1a2e',
  },
  chartPanel: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  chartItem: {
    marginBottom: 16,
  },
  chartItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  chartItemName: {
    fontSize: 14,
    fontFamily: FONT.semi,
    color: '#212529',
    flex: 1,
    marginRight: 8,
  },
  chartItemValue: {
    fontSize: 14,
    fontFamily: FONT.bold,
    color: '#212529',
  },
  chartItemSubText: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: '#868e96',
    marginBottom: 6,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#e9ecef',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  emptyStatsText: {
    textAlign: 'center',
    color: '#868e96',
    fontFamily: FONT.regular,
    fontSize: 14,
    paddingVertical: 12,
  },
  loginContainer: {
    paddingHorizontal: 24,
    paddingTop: 36,
    paddingBottom: 24,
  },
  loginWelcomeTitle: {
    fontSize: 28,
    fontFamily: FONT.bold,
    color: '#006c35',
    marginBottom: 8,
    textAlign: 'center',
  },
  loginWelcomeSubtitle: {
    fontSize: 16,
    fontFamily: FONT.regular,
    color: '#555555',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  loginFieldLabel: {
    fontSize: 14,
    fontFamily: FONT.semi,
    color: '#292929',
    marginBottom: 8,
    marginTop: 16,
  },
  loginInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
  },
  loginInputIcon: {
    fontSize: 18,
    marginRight: 12,
    color: '#718096',
  },
  loginTextInput: {
    flex: 1,
    height: '100%',
    fontSize: 16,
    color: '#1a202c',
    fontFamily: FONT.regular,
  },
  loginInputClearBtn: {
    padding: 6,
  },
  loginInputClearText: {
    color: '#a0aec0',
    fontSize: 14,
  },
  loginInputEyeBtn: {
    padding: 6,
  },
  loginInputEyeText: {
    fontSize: 18,
  },
  loginErrorBoxInline: {
    marginTop: 12,
    backgroundColor: '#fff5f5',
    borderColor: '#fed7d7',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  loginErrorText: {
    color: '#c53030',
    fontSize: 14,
    fontFamily: FONT.regular,
  },
  loginSubmitButton: {
    flexDirection: 'row',
    height: 54,
    borderRadius: 14,
    backgroundColor: '#006c35',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
    paddingHorizontal: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  loginSubmitText: {
    flex: 1,
    textAlign: 'center',
    color: '#ffffff',
    fontSize: 17,
    fontFamily: FONT.bold,
    marginLeft: 28,
  },
  loginSubmitArrowCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginSubmitArrowText: {
    color: '#006c35',
    fontSize: 16,
    fontFamily: FONT.bold,
  },
  demoPanel: {
    backgroundColor: '#e8f6ed',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#d2eedb',
    marginTop: 32,
  },
  demoHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  demoTitle: {
    fontSize: 15,
    fontFamily: FONT.bold,
    color: '#006c35',
  },
  demoInfoIcon: {
    fontSize: 16,
    color: '#006c35',
  },
  demoBodyText: {
    fontSize: 14,
    fontFamily: FONT.regular,
    color: '#2e7d32',
    lineHeight: 20,
  },
  loginFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 48,
    marginBottom: 20,
    gap: 8,
  },
  loginFooterIcon: {
    fontSize: 18,
    color: '#718096',
  },
  loginFooterText: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: '#718096',
    textAlign: 'center',
  },
  greenBannerContainer: {
    padding: 16,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  greenBannerImage: {
    borderRadius: 16,
  },
  bannerLogoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  bannerLogoText: {
    fontSize: 18,
    fontFamily: FONT.bold,
    color: '#ffffff',
  },
  bannerUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  bannerAvatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerAvatarEmoji: {
    fontSize: 22,
  },
  bannerUserInfo: {
    flex: 1,
    gap: 2,
  },
  bannerUserName: {
    fontSize: 18,
    fontFamily: FONT.bold,
    color: '#ffffff',
  },
  bannerUserOutlet: {
    fontSize: 13,
    fontFamily: FONT.regular,
    color: '#e2e8f0',
  },
  bannerRolePill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#ffffff30',
  },
  bannerRoleText: {
    fontSize: 12,
    fontFamily: FONT.semi,
    color: '#ffffff',
  },
  bannerLogoutBtn: {
    flexDirection: 'row',
    height: 42,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  bannerLogoutIcon: {
    fontSize: 15,
    color: '#292929',
  },
  bannerLogoutText: {
    fontSize: 14,
    fontFamily: FONT.semi,
    color: '#292929',
  },
  totalRequestsLabel: {
    fontSize: 14,
    fontFamily: FONT.regular,
    color: '#666',
    marginHorizontal: 4,
    marginBottom: 8,
  },
  wizardContainer: {
    gap: 16,
    paddingBottom: 24,
  },
  wizardSectionTitle: {
    fontSize: 20,
    fontFamily: FONT.bold,
    color: '#1a202c',
    marginTop: 8,
  },
  wizardSectionSub: {
    fontSize: 13,
    fontFamily: FONT.regular,
    color: '#718096',
    marginTop: -10,
  },
  // Mode selection cards
  modeCardsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  modeCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    padding: 16,
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  modeCardIconBox: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeCardIconLines: {
    gap: 6,
    alignItems: 'flex-start',
  },
  modeIconLine: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#f97316',
  },
  modeCardAiBrain: {
    alignItems: 'center',
    gap: 5,
  },
  modeCardAiCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: '#0d803d',
  },
  modeCardAiDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0d803d',
    marginTop: -4,
  },
  modeCardAiLine: {
    height: 3,
    borderRadius: 2,
    backgroundColor: '#0d803d',
    opacity: 0.5,
  },
  modeCardTitle: {
    fontSize: 16,
    fontFamily: FONT.bold,
    color: '#1a202c',
  },
  modeCardDesc: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: '#718096',
    textAlign: 'center',
  },
  // Outlet chips
  outletSelectorBox: {
    gap: 8,
  },
  outletChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  outletChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    maxWidth: 160,
  },
  outletChipActive: {
    borderColor: '#0d803d',
    backgroundColor: '#e6f4ec',
  },
  outletChipText: {
    fontSize: 13,
    fontFamily: FONT.semi,
    color: '#4a5568',
  },
  outletChipTextActive: {
    color: '#0d803d',
  },
  // AI photo block
  aiPhotoBlock: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  aiPhotoPressable: {
    height: 200,
    borderRadius: 18,
    overflow: 'hidden',
    position: 'relative',
  },
  aiPhotoPreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  aiPhotoPlaceholder: {
    flex: 1,
    backgroundColor: '#f7f8fa',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  aiCameraIcon: {
    width: 44,
    height: 34,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    marginBottom: 6,
  },
  aiCameraBody: {
    width: 40,
    height: 28,
    borderRadius: 6,
    borderWidth: 3,
    borderColor: '#a0aec0',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    marginTop: 4,
  },
  aiCameraLens: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2.5,
    borderColor: '#a0aec0',
  },
  aiCameraTop: {
    width: 10,
    height: 3,
    backgroundColor: '#a0aec0',
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    position: 'absolute',
    top: 0,
  },
  aiPhotoPlaceholderText: {
    fontSize: 14,
    fontFamily: FONT.regular,
    color: '#a0aec0',
    marginTop: 10,
  },
  aiPhotoPlusBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#0d803d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiPhotoPlusText: {
    fontSize: 18,
    color: '#ffffff',
    fontFamily: FONT.bold,
    lineHeight: 22,
  },
  progressWidget: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
  },
  progressTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressTitle: {
    fontSize: 15,
    fontFamily: FONT.semi,
    color: '#2d3748',
  },
  progressPercent: {
    fontSize: 16,
    fontFamily: FONT.bold,
    color: '#48bb78',
  },
  progressOuterBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#edf2f7',
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressInnerBar: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#48bb78',
  },
  progressLabelSub: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: '#a0aec0',
  },
  newRequestNavCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fffaf5',
    borderColor: '#ffebdb',
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },
  newRequestNavIconBg: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#fff0e5',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginRight: 12,
  },
  newRequestNavIconEmoji: {
    fontSize: 20,
  },
  newRequestNavIconPlus: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    fontSize: 12,
    fontWeight: 'bold',
    color: '#ff6b00',
  },
  newRequestNavContent: {
    flex: 1,
    gap: 2,
  },
  newRequestNavTitle: {
    fontSize: 15,
    fontFamily: FONT.bold,
    color: '#2d3748',
  },
  newRequestNavSubtitle: {
    fontSize: 13,
    fontFamily: FONT.regular,
    color: '#a0aec0',
  },
  newRequestNavChevron: {
    fontSize: 16,
    color: '#dd6b20',
  },
  wizardFieldLabel: {
    fontSize: 14,
    fontFamily: FONT.semi,
    color: '#292929',
    marginTop: 8,
    marginBottom: 6,
  },
  wizardTextInput: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    fontSize: 15,
    fontFamily: FONT.regular,
    color: '#2d3748',
  },
  photoUploadRow: {
    flexDirection: 'row',
    gap: 12,
  },
  photoUploadPreviewBox: {
    flex: 1,
    height: 100,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoUploadPreviewImage: {
    width: '100%',
    height: '100%',
  },
  photoUploadPreviewPlaceholder: {
    fontSize: 14,
    fontFamily: FONT.regular,
    color: '#a0aec0',
  },
  photoUploadButton: {
    width: 100,
    height: 100,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    position: 'relative',
  },
  photoUploadButtonCamera: {
    fontSize: 24,
  },
  photoUploadButtonText: {
    fontSize: 10,
    fontFamily: FONT.regular,
    color: '#718096',
    textAlign: 'center',
  },
  photoUploadPlusBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#48bb78',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoUploadPlusText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
    lineHeight: 12,
  },
  wizardProceedBtn: {
    flexDirection: 'row',
    height: 54,
    borderRadius: 14,
    backgroundColor: '#006c35',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    paddingHorizontal: 20,
  },
  wizardProceedText: {
    flex: 1,
    textAlign: 'center',
    color: '#ffffff',
    fontSize: 16,
    fontFamily: FONT.bold,
    marginLeft: 28,
  },
  wizardProceedArrowCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wizardProceedArrowText: {
    color: '#006c35',
    fontSize: 14,
    fontFamily: FONT.bold,
  },
  detailsContainer: {
    gap: 16,
    paddingBottom: 24,
  },
  detailsBackBtn: {
    paddingVertical: 4,
    paddingHorizontal: 2,
    alignSelf: 'flex-start',
  },
  detailsBackText: {
    fontSize: 15,
    fontFamily: FONT.semi,
    color: '#0d803d',
  },
  detailsPhotoBlock: {
    height: 180,
    borderRadius: 16,
    overflow: 'hidden',
  },
  detailsPhotoImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  detailsPhotoEmpty: {
    flex: 1,
    backgroundColor: '#f7f8fa',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  detailsPhotoCameraBox: {
    alignItems: 'center',
  },
  detailsPhotoEmptyText: {
    fontSize: 14,
    fontFamily: FONT.regular,
    color: '#a0aec0',
  },
  extraPhotosRow: {
    flexDirection: 'row',
    marginTop: -4,
  },
  extraPhotoThumb: {
    width: 80,
    height: 80,
    borderRadius: 10,
    overflow: 'hidden',
    marginRight: 8,
    position: 'relative',
  },
  extraPhotoThumbImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  extraPhotoRemoveBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  extraPhotoRemoveText: {
    color: '#ffffff',
    fontSize: 12,
    fontFamily: FONT.bold,
    lineHeight: 14,
  },
  extraPhotoAddBtn: {
    width: 80,
    height: 80,
    borderRadius: 10,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#cbd5e0',
    backgroundColor: '#f7fafc',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  extraPhotoAddText: {
    fontSize: 18,
    fontFamily: FONT.bold,
    color: '#a0aec0',
    textAlign: 'center',
    lineHeight: 22,
  },
  detailsQuantityRow: {
    flexDirection: 'row',
    gap: 12,
  },
  detailsQuantityInput: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: FONT.semi,
    color: '#2d3748',
  },
  detailsUnitBadge: {
    height: 52,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f7fafc',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
  },
  detailsUnitBadgeText: {
    fontSize: 15,
    fontFamily: FONT.semi,
    color: '#718096',
  },
  reasonsChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 4,
  },
  reasonChipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  reasonChipItemActive: {
    borderColor: '#48bb78',
    backgroundColor: '#f0fff4',
  },
  reasonChipText: {
    fontSize: 13.5,
    fontFamily: FONT.regular,
    color: '#4a5568',
  },
  reasonChipTextActive: {
    fontFamily: FONT.semi,
    color: '#22c55e',
  },
  reasonChipCheck: {
    marginLeft: 6,
    fontSize: 13,
    color: '#22c55e',
    fontWeight: 'bold',
  },
  reasonChipCheckDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
    marginLeft: 6,
  },
  costCardsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  costCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    gap: 4,
  },
  costCardLabel: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: '#718096',
  },
  costCardValue: {
    fontSize: 16,
    fontFamily: FONT.bold,
    color: '#2d3748',
  },
  expiryGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  expiryInputGroup: {
    flex: 1,
  },
  damageBox: {
    gap: 8,
  },
  deductionToggleSegmented: {
    flexDirection: 'row',
    backgroundColor: '#edf2f7',
    borderRadius: 12,
    padding: 2,
    marginTop: 12,
  },
  deductionToggleBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  deductionToggleBtnActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  deductionToggleText: {
    fontSize: 14,
    fontFamily: FONT.regular,
    color: '#718096',
  },
  deductionToggleTextActive: {
    fontFamily: FONT.semi,
    color: '#006c35',
  },
  deductionFieldsContainer: {
    gap: 12,
    marginTop: 8,
  },
  deductionEmployeeSelector: {
    marginTop: 4,
  },
  deductionEmployeeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 45,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#c6f6d5',
    backgroundColor: '#f0fff4',
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  deductionEmployeeChipIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  deductionEmployeeChipText: {
    fontSize: 14,
    fontFamily: FONT.semi,
    color: '#22c55e',
    marginRight: 8,
  },
  deductionEmployeeChipClear: {
    padding: 2,
  },
  deductionEmployeeChipClearText: {
    fontSize: 14,
    color: '#22c55e',
    fontWeight: 'bold',
  },
  detailsCommentInput: {
    height: 90,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingTop: 12,
    fontSize: 15,
    fontFamily: FONT.regular,
    color: '#2d3748',
    textAlignVertical: 'top',
  },
  detailsSubmitBtn: {
    flexDirection: 'row',
    height: 54,
    borderRadius: 14,
    backgroundColor: '#006c35',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    paddingHorizontal: 20,
  },
  detailsSubmitText: {
    flex: 1,
    textAlign: 'center',
    color: '#ffffff',
    fontSize: 16,
    fontFamily: FONT.bold,
    marginLeft: 28,
  },
  detailsSubmitIconBg: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsSubmitIconEmoji: {
    fontSize: 18,
    color: '#ffffff',
  },
  requestStatusBadgeRow: {
    flexDirection: 'row',
    marginTop: 6,
  },
  requestChevron: {
    fontSize: 16,
    color: '#a0aec0',
    marginLeft: 8,
    alignSelf: 'center',
  },
})
