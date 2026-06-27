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
  KeyboardAvoidingView,
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
type ViewMode = 'create' | 'mine' | 'review' | 'history'

type Outlet = {
  id: string
  name: string
  address: string
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
  outletId: string
  outletIds: string[]
  accessScope: 'assigned' | 'all'
  iikoEmployeeId: string
}

type Reason = {
  id: string
  name: string
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
  comment: string
  photoUrl: string
  photoName: string
  photoHash: string
}

const API_URL = normalizeBaseUrl(
  process.env.EXPO_PUBLIC_API_URL ?? 'http://46.101.134.38:4000/api',
)
const WEB_URL = normalizeBaseUrl(
  process.env.EXPO_PUBLIC_WEB_URL ?? 'http://46.101.134.38:4000',
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
  const [error, setError] = useState('')
  const [form, setForm] = useState<FormState>(createEmptyForm())
  const [selectedRequestId, setSelectedRequestId] = useState('')
  const [rejectionDraft, setRejectionDraft] = useState('')

  const selectedProduct = data.products.find((product) => product.id === form.productId)

  const myRequests = useMemo(
    () => data.requests.filter((request) => request.createdById === currentUser?.id),
    [currentUser?.id, data.requests],
  )

  const pendingRequests = useMemo(
    () => data.requests.filter((request) => request.status === 'pending'),
    [data.requests],
  )

  const selectedRequest =
    data.requests.find((request) => request.id === selectedRequestId) ?? pendingRequests[0]

  const loadData = useCallback(async (userOverride?: Employee | null) => {
    try {
      setError('')
      const activeUser = userOverride === undefined ? currentUser : userOverride
      const query = activeUser?.id ? `?userId=${encodeURIComponent(activeUser.id)}` : ''
      const payload = await requestJson<BootstrapPayload>(`/bootstrap${query}`)
      setData(payload)
      setSelectedRequestId((current) =>
        payload.requests.some((request) => request.id === current)
          ? current
          : payload.requests[0]?.id || '',
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
        body: JSON.stringify({ login: loginName, password }),
      })
      const query = `?userId=${encodeURIComponent(result.user.id)}`
      const payload = await requestJson<BootstrapPayload>(`/bootstrap${query}`)
      setCurrentUser(result.user)
      setData(payload)
      setViewMode(result.user.role === 'sender' ? 'create' : 'review')
      setSelectedRequestId(payload.requests[0]?.id || '')
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
    setViewMode('create')
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
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

  function useDemoPhoto() {
    setForm((current) => ({
      ...current,
      photoUrl: `${WEB_URL}/writeoff-evidence.png`,
      photoName: 'writeoff-evidence.png',
      photoHash: `sha256:rn-demo-${Date.now().toString(16).slice(-8)}`,
    }))
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
  }

  async function submitRequest() {
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
          createdById: currentUser.id,
        }),
      })
      await loadData()
      setForm(createDefaultForm(data, currentUser))
      setViewMode('mine')
    } catch (requestError) {
      Alert.alert(
        'Не удалось отправить',
        requestError instanceof Error ? requestError.message : 'Ошибка API',
      )
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
      Alert.alert(
        'Не удалось подтвердить',
        requestError instanceof Error ? requestError.message : 'Ошибка API',
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function rejectRequest(requestId: string) {
    if (!currentUser) return
    const reason = rejectionDraft.trim()
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
      Alert.alert(
        'Не удалось отклонить',
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
        <View style={styles.header}>
          <BahandiLogo />
          <Text style={styles.headerTitle}>Списание+</Text>
          <Text style={styles.headerSub}>React Native приложение</Text>
        </View>

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
              <View style={styles.userGrid}>
                <View style={styles.greenCard}>
                  <Text style={styles.greenLabel}>Роль</Text>
                  <Text style={styles.greenValue}>
                    {currentUser.role === 'sender' ? 'Сотрудник' : 'Проверяющий'}
                  </Text>
                </View>
                <View style={styles.greenCard}>
                  <Text style={styles.greenLabel}>Пользователь</Text>
                  <Text style={styles.greenValue}>{currentUser.name}</Text>
                </View>
              </View>

              <Pressable style={styles.logoutButton} onPress={logout}>
                <Text style={styles.logoutText}>Выйти</Text>
              </Pressable>

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
                      data={data}
                      form={form}
                      isSaving={isSaving}
                      selectedProduct={selectedProduct}
                      onSetField={setField}
                      onPickCamera={pickCamera}
                      onPickGallery={pickGallery}
                      onDemoPhoto={useDemoPhoto}
                      onSubmit={submitRequest}
                    />
                  ) : (
                    <RequestList requests={myRequests} products={data.products} />
                  )}
                </>
              ) : (
                <>
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
                  </View>

                  {viewMode === 'review' ? (
                    <ReviewerView
                      request={selectedRequest}
                      pendingRequests={pendingRequests}
                      products={data.products}
                      outlets={data.outlets}
                      rejectionDraft={rejectionDraft}
                      isSaving={isSaving}
                      onSelect={setSelectedRequestId}
                      onRejectionChange={setRejectionDraft}
                      onApprove={approveRequest}
                      onReject={rejectRequest}
                    />
                  ) : (
                    <RequestList requests={data.requests} products={data.products} />
                  )}
                </>
              )}
            </>
          )}
        </ScrollView>
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
  return (
    <View style={styles.loginPanel}>
      <Text style={styles.loginTitle}>Авторизация</Text>
      <Text style={styles.loginCopy}>
        Войдите личным логином. Доступ к точкам откроется по роли пользователя.
      </Text>

      <Text style={styles.label}>Логин</Text>
      <TextInput
        value={loginName}
        onChangeText={onLoginNameChange}
        placeholder="aibek"
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />

      <Text style={styles.label}>Пароль</Text>
      <TextInput
        value={password}
        onChangeText={onPasswordChange}
        placeholder="demo123"
        secureTextEntry
        style={styles.input}
      />

      <Text style={styles.hashText}>aibek/demo123 · aigerim/review123 · manager/manager123</Text>

      {authError ? (
        <View style={styles.errorBoxInline}>
          <Text style={styles.errorText}>{authError}</Text>
        </View>
      ) : null}

      <Pressable
        disabled={isSaving}
        style={[styles.submitButton, isSaving && styles.disabledButton]}
        onPress={onLogin}
      >
        {isSaving ? <ActivityIndicator color="#ffffff" /> : null}
        <Text style={styles.submitText}>Войти</Text>
      </Pressable>
    </View>
  )
}

function SenderForm({
  data,
  form,
  isSaving,
  selectedProduct,
  onSetField,
  onPickCamera,
  onPickGallery,
  onDemoPhoto,
  onSubmit,
}: {
  data: BootstrapPayload
  form: FormState
  isSaving: boolean
  selectedProduct?: Product
  onSetField: <K extends keyof FormState>(key: K, value: FormState[K]) => void
  onPickCamera: () => void
  onPickGallery: () => void
  onDemoPhoto: () => void
  onSubmit: () => void
}) {
  return (
    <View style={styles.form}>
      <View style={styles.photoBox}>
        {form.photoUrl ? (
          <Image source={{ uri: form.photoUrl }} style={styles.photo} />
        ) : (
          <Text style={styles.photoPlaceholder}>Фото продукции</Text>
        )}
      </View>

      <View style={styles.actionRow}>
        <SecondaryButton label="Камера" onPress={onPickCamera} />
        <SecondaryButton label="Галерея" onPress={onPickGallery} />
        <OrangeButton label="Demo" onPress={onDemoPhoto} />
      </View>

      {form.photoHash ? <Text style={styles.hashText}>{form.photoHash}</Text> : null}

      <Text style={styles.label}>Торговая точка</Text>
      <ChipGrid
        items={data.outlets}
        value={form.outletId}
        getLabel={(item) => item.name}
        onChange={(value) => onSetField('outletId', value)}
      />

      <Text style={styles.label}>Продукт</Text>
      <ChipGrid
        items={data.products}
        value={form.productId}
        getLabel={(item) => item.name}
        onChange={(value) => onSetField('productId', value)}
      />

      <View style={styles.inputGrid}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Количество</Text>
          <TextInput
            keyboardType="decimal-pad"
            value={form.quantity}
            onChangeText={(value) => onSetField('quantity', value)}
            style={styles.input}
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Ед.</Text>
          <TextInput value={selectedProduct?.unit ?? 'шт'} editable={false} style={styles.input} />
        </View>
      </View>

      <Text style={styles.label}>Причина</Text>
      <ChipGrid
        items={data.reasons}
        value={form.reasonId}
        getLabel={(item) => item.name}
        onChange={(value) => onSetField('reasonId', value)}
      />

      <View style={styles.segmented}>
        <TabButton
          active={form.type === 'without_deduction'}
          label="Без удержания"
          onPress={() => onSetField('type', 'without_deduction')}
        />
        <TabButton
          active={form.type === 'with_deduction'}
          label="С удержанием"
          onPress={() => onSetField('type', 'with_deduction')}
        />
      </View>

      {form.type === 'with_deduction' ? (
        <>
          <Text style={styles.label}>Сотрудник для удержания</Text>
          <ChipGrid
            items={data.employees.filter((employee) => employee.role === 'sender')}
            value={form.deductionEmployeeId}
            getLabel={(item) => item.name}
            onChange={(value) => onSetField('deductionEmployeeId', value)}
          />
        </>
      ) : null}

      <Text style={styles.label}>Комментарий</Text>
      <TextInput
        value={form.comment}
        onChangeText={(value) => onSetField('comment', value)}
        placeholder="Например: булочки повреждены при приемке"
        multiline
        style={[styles.input, styles.commentInput]}
      />

      <Pressable
        disabled={isSaving}
        style={[styles.submitButton, isSaving && styles.disabledButton]}
        onPress={onSubmit}
      >
        {isSaving ? <ActivityIndicator color="#ffffff" /> : null}
        <Text style={styles.submitText}>Отправить на проверку</Text>
      </Pressable>
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
  onSelect,
  onRejectionChange,
  onApprove,
  onReject,
}: {
  request?: WriteOffRequest
  pendingRequests: WriteOffRequest[]
  products: Product[]
  outlets: Outlet[]
  rejectionDraft: string
  isSaving: boolean
  onSelect: (id: string) => void
  onRejectionChange: (value: string) => void
  onApprove: (id: string) => void
  onReject: (id: string) => void
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

  return (
    <View style={styles.reviewPanel}>
      <Text style={styles.label}>Очередь проверки</Text>
      <View style={styles.chipGrid}>
        {pendingRequests.map((item) => (
          <Pressable
            key={item.id}
            style={[styles.chip, item.id === request.id && styles.chipActive]}
            onPress={() => onSelect(item.id)}
          >
            <Text style={[styles.chipText, item.id === request.id && styles.chipTextActive]}>
              #{item.id}
            </Text>
          </Pressable>
        ))}
      </View>

      <Image source={{ uri: request.photoUrl }} style={styles.reviewPhoto} />
      <Text style={styles.reviewTitle}>#{request.id} · {product?.name ?? 'Продукт'}</Text>
      <Text style={styles.requestMeta}>{outlet?.name ?? 'Bahandi'}</Text>
      <Text style={styles.reviewInfo}>
        {request.quantity} {request.unit} · {request.type === 'with_deduction' ? 'с удержанием' : 'без удержания'}
      </Text>
      <Text style={styles.commentText}>{request.comment}</Text>

      <Text style={styles.label}>Причина отклонения</Text>
      <TextInput
        value={rejectionDraft}
        onChangeText={onRejectionChange}
        placeholder="Например: фото не подтверждает количество"
        multiline
        style={[styles.input, styles.commentInput]}
      />

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

function RequestList({
  requests,
  products,
}: {
  requests: WriteOffRequest[]
  products: Product[]
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
}: {
  active: boolean
  label: string
  onPress: () => void
}) {
  return (
    <Pressable style={[styles.tabButton, active && styles.tabButtonActive]} onPress={onPress}>
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

function OrangeButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.orangeButton} onPress={onPress}>
      <Text style={styles.orangeText}>{label}</Text>
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

function RequestCard({
  request,
  productName,
}: {
  request: WriteOffRequest
  productName: string
}) {
  return (
    <View style={styles.requestCard}>
      <Image source={{ uri: request.photoUrl }} style={styles.requestPhoto} />
      <View style={styles.requestBody}>
        <Text style={styles.requestTitle}>
          #{request.id} · {productName}
        </Text>
        <Text style={styles.requestMeta}>
          {request.quantity} {request.unit} · {new Date(request.createdAt).toLocaleDateString('ru-RU')}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: `${statusColor[request.status]}18` }]}>
          <Text style={[styles.statusText, { color: statusColor[request.status] }]}>
            {statusCopy[request.status]}
          </Text>
        </View>
      </View>
    </View>
  )
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

function createDefaultForm(data: BootstrapPayload, sender?: Employee): FormState {
  const preferredOutletId = sender?.outletIds?.[0] ?? sender?.outletId
  const outlet = data.outlets.find((item) => item.id === preferredOutletId) ?? data.outlets[0]
  return {
    outletId: outlet?.id ?? '',
    productId: data.products[0]?.id ?? '',
    quantity: '1',
    reasonId: data.reasons[0]?.id ?? '',
    type: 'without_deduction',
    deductionEmployeeId: '',
    comment: '',
    photoUrl: '',
    photoName: '',
    photoHash: '',
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
    fontSize: 19.2,
    fontWeight: '700',
    fontFamily: FONT.bold,
  },
  headerSub: {
    color: 'rgba(0, 0, 0, 0.5)',
    fontSize: 14.4,
    fontWeight: '600',
    fontFamily: FONT.semi,
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
  userGrid: {
    gap: 8,
  },
  greenCard: {
    gap: 6,
    minHeight: 78,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#0d803d',
  },
  greenLabel: {
    color: 'rgba(255,255,255,0.76)',
    fontSize: 14.4,
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  greenValue: {
    color: '#ffffff',
    fontSize: 19.2,
    fontWeight: '700',
    fontFamily: FONT.bold,
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
    fontWeight: '700',
    fontFamily: FONT.bold,
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
    fontWeight: '700',
    fontFamily: FONT.bold,
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
    fontWeight: '700',
    fontFamily: FONT.bold,
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
    fontWeight: '700',
    fontFamily: FONT.bold,
  },
  form: {
    gap: 12,
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
    fontWeight: '700',
    fontFamily: FONT.bold,
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
    fontWeight: '700',
    fontFamily: FONT.bold,
  },
  orangeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ffc3a7',
    backgroundColor: '#fff0e8',
  },
  orangeText: {
    color: '#ff5e12',
    fontWeight: '700',
    fontFamily: FONT.bold,
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
    fontWeight: '700',
    fontFamily: FONT.bold,
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
    fontWeight: '700',
    fontFamily: FONT.bold,
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
    fontWeight: '700',
    fontFamily: FONT.bold,
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
  reviewPhoto: {
    width: '100%',
    height: 240,
    borderRadius: 14,
    backgroundColor: '#f8f8f8',
  },
  reviewTitle: {
    color: '#292929',
    fontSize: 19.2,
    fontWeight: '700',
    fontFamily: FONT.bold,
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
    fontWeight: '700',
    fontFamily: FONT.bold,
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
    fontWeight: '700',
    fontFamily: FONT.bold,
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
    fontWeight: '700',
    fontFamily: FONT.bold,
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
    fontWeight: '700',
    fontFamily: FONT.bold,
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
    fontWeight: '700',
    fontFamily: FONT.bold,
  },
})
