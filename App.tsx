import { StatusBar } from 'expo-status-bar'
import { Audio } from 'expo-av'
import * as FileSystem from 'expo-file-system'
import {
  GolosText_400Regular,
  GolosText_600SemiBold,
  GolosText_700Bold,
  GolosText_900Black,
  useFonts,
} from '@expo-google-fonts/golos-text'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

type Role = 'sender' | 'reviewer'
type Status = 'pending' | 'approved' | 'rejected' | 'iiko_error'
type WriteOffType = 'without_deduction' | 'with_deduction'
type ViewMode = 'create' | 'mine' | 'review' | 'history' | 'stats'
type Language = 'ru' | 'kk'
type FormEntryMode = 'manual' | 'ai'

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
  accessScope: 'assigned' | 'city' | 'all'
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
  photoUrls?: string[]
  photoNames?: string[]
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

type FontScalingComponent = {
  defaultProps?: {
    allowFontScaling?: boolean
    maxFontSizeMultiplier?: number
  }
}

const textDefaults = Text as unknown as FontScalingComponent
textDefaults.defaultProps = {
  ...(textDefaults.defaultProps ?? {}),
  allowFontScaling: false,
  maxFontSizeMultiplier: 1,
}

const textInputDefaults = TextInput as unknown as FontScalingComponent
textInputDefaults.defaultProps = {
  ...(textInputDefaults.defaultProps ?? {}),
  allowFontScaling: false,
  maxFontSizeMultiplier: 1,
}

const SCREEN_WIDTH = Dimensions.get('window').width
const IS_COMPACT_PHONE = SCREEN_WIDTH <= 393
const IS_TINY_PHONE = SCREEN_WIDTH <= 360

const emptyData: BootstrapPayload = {
  outlets: [],
  products: [],
  employees: [],
  reasons: [],
  requests: [],
  serverTime: '',
}

const statusColor: Record<Status, string> = {
  pending: '#ff5e12',
  approved: '#0d803d',
  rejected: '#c83c31',
  iiko_error: '#c83c31',
}

const rejectReasons = ['Некачественное фото', 'Недостаточно оснований', 'Обсудим лично']

const translations = {
  ru: {
    loading: 'Загрузка...',
    sender: 'Сотрудник',
    reviewer: 'Проверяющий',
    logout: 'Выйти',
    writeOff: 'Списать',
    myRequests: 'Мои заявки',
    review: 'Проверка',
    history: 'История',
    stats: 'Статистика',
    addEmployee: '+ Добавить сотрудника',
    totalRequests: 'Всего заявок: {{count}}',
    welcome: 'Добро пожаловать!',
    loginSubtitle: 'Войдите личным логином\nи пин-кодом.',
    login: 'Логин',
    pin: 'Пин-код',
    hide: 'скрыть',
    show: 'показать',
    signIn: 'Войти',
    demoAccount: 'Демо-аккаунт',
    accessHelp: 'По вопросам доступа\nобратитесь к администратору.',
    chooseOutlet: 'Выберите точку',
    outletSearchPlaceholder: 'Поиск по названию или адресу',
    outletsAvailable: 'Доступно точек: {{count}}',
    noOutletsFound: 'Точки не найдены',
    newRequest: 'Новая заявка на списание',
    manual: 'Вручную',
    manualDesc: 'Заполните форму самостоятельно',
    withAi: 'С ИИ',
    withAiDesc: 'ИИ заполнит по фото',
    back: 'Назад',
    aiAnalysis: 'Анализ с ИИ',
    aiSubtitle: 'Сфотографируйте товар — ИИ определит продукт и причину',
    tapToAddPhoto: 'Нажмите чтобы добавить фото',
    aiHintLabel: 'Описание (подсказка для ИИ)',
    aiHintPlaceholder: 'Например: помялось, истек срок, упало',
    analyzePhoto: 'Анализировать фото',
    analyzedPhoto: 'Фото уже проанализировано',
    detailsNext: 'Далее — заполнить детали',
    productPhoto: 'Фото товара',
    camera: 'Камера',
    gallery: 'Галерея',
    addPhoto: '+\nфото',
    chooseProduct: 'Выберите продукт',
    productSearchPlaceholder: 'Начните вводить название...',
    noResults: 'Ничего не найдено',
    quantity: 'Количество',
    writeoffReason: 'Причина списания',
    unitPiece: 'шт',
    cost: 'Себестоимость',
    writeoffTotal: 'Итого к списанию',
    productionDate: 'Дата производства',
    expiryDate: 'Годен до',
    damageType: 'Вид повреждения',
    damageWhen: 'Когда обнаружено',
    noDeduction: 'Без удержания',
    withDeduction: 'С удержанием',
    deductionEmployee: 'Сотрудник для удержания',
    deductionReason: 'Причина удержания',
    deductionPlaceholder: 'Например: халатность',
    comment: 'Комментарий',
    commentPlaceholder: 'Например: булочки повреждены при приемке',
    submitForReview: 'Отправить на проверку',
    queueEmpty: 'Очередь пуста',
    reviewQueue: 'Очередь проверки',
    pendingLabel: 'На проверке',
    selected: 'Выбрано: {{count}}',
    clear: 'Снять',
    approve: 'Подтвердить',
    reject: 'Отклонить',
    rejectionReason: 'Причина отклонения',
    rejectionPlaceholder: 'Например: фото не подтверждает количество',
    atCost: 'по себестоимости',
    request: 'Заявка',
    product: 'Продукт',
    noRequests: 'Заявок пока нет',
    statsTitle: 'Сводные данные (утверждено)',
    export: 'Экспорт',
    exportTitle: 'Экспорт статистики',
    totalWriteoff: 'Сумма списаний',
    totalDeductions: 'Сумма удержаний',
    avgWriteoff: 'Среднее списание',
    allRequests: 'Всего заявок',
    approvedShort: 'Утв',
    rejectedShort: 'Откл',
    pendingShort: 'Ожид',
    byOutlets: 'По точкам',
    employees: 'Сотрудники',
    reasons: 'Причины',
    noOutletStats: 'Нет данных по точкам',
    noEmployeeStats: 'Нет данных по сотрудникам',
    noReasonStats: 'Нет данных по причинам',
    employeeRole: 'Сотрудник',
    reviewerRole: 'Проверяющий',
    newEmployee: 'Новый сотрудник',
    fullName: 'ФИО сотрудника',
    city: 'Город',
    cancel: 'Отмена',
    save: 'Сохранить',
    outlet: 'Точка',
    address: 'Адрес',
    amount: 'Сумма',
    type: 'Тип',
    sentBy: 'Отправил',
    createdAt: 'Создано',
    reviewedBy: 'Проверил',
    reviewedAt: 'Проверено',
    notSpecified: 'Не указана',
    addressEmpty: 'Адрес не указан',
    noComment: 'Нет комментария',
    close: 'Закрыть',
    photos: 'Фото',
    micStart: 'Голосом',
    micStop: 'Стоп',
    speechProcessing: 'Распознаем...',
    speechUnsupportedTitle: 'Голосовой ввод',
    speechUnsupportedMessage: 'Разрешите доступ к микрофону и попробуйте ещё раз.',
    speechError: 'Не удалось распознать речь. Попробуйте ещё раз.',
    pending: 'На проверке',
    approved: 'Подтверждено',
    rejected: 'Отклонено',
    iiko_error: 'Ошибка Iiko',
  },
  kk: {
    loading: 'Жүктелуде...',
    sender: 'Қызметкер',
    reviewer: 'Тексеруші',
    logout: 'Шығу',
    writeOff: 'Есептен шығару',
    myRequests: 'Менің өтінімдерім',
    review: 'Тексеру',
    history: 'Тарих',
    stats: 'Статистика',
    addEmployee: '+ Қызметкер қосу',
    totalRequests: 'Барлық өтінім: {{count}}',
    welcome: 'Қош келдіңіз!',
    loginSubtitle: 'Жеке логин және\nпин-кодпен кіріңіз.',
    login: 'Логин',
    pin: 'Пин-код',
    hide: 'жасыру',
    show: 'көрсету',
    signIn: 'Кіру',
    demoAccount: 'Демо-аккаунт',
    accessHelp: 'Қолжетімділік бойынша\nәкімшіге хабарласыңыз.',
    chooseOutlet: 'Нүктені таңдаңыз',
    outletSearchPlaceholder: 'Атауы немесе мекенжайы бойынша іздеу',
    outletsAvailable: 'Қолжетімді нүкте: {{count}}',
    noOutletsFound: 'Нүкте табылмады',
    newRequest: 'Есептен шығару өтінімі',
    manual: 'Қолмен',
    manualDesc: 'Форманы өзіңіз толтырыңыз',
    withAi: 'ЖИ арқылы',
    withAiDesc: 'ЖИ фото бойынша толтырады',
    back: 'Артқа',
    aiAnalysis: 'ЖИ талдауы',
    aiSubtitle: 'Тауарды фотоға түсіріңіз — ЖИ өнім мен себепті анықтайды',
    tapToAddPhoto: 'Фото қосу үшін басыңыз',
    aiHintLabel: 'Сипаттама (ЖИ үшін)',
    aiHintPlaceholder: 'Мысалы: майысты, мерзімі өтті, құлады',
    analyzePhoto: 'Фотоны талдау',
    analyzedPhoto: 'Фото талданып қойған',
    detailsNext: 'Әрі қарай — деректерді толтыру',
    productPhoto: 'Тауар фотосы',
    camera: 'Камера',
    gallery: 'Галерея',
    addPhoto: '+\nфото',
    chooseProduct: 'Өнімді таңдаңыз',
    productSearchPlaceholder: 'Атауын тере бастаңыз...',
    noResults: 'Ештеңе табылмады',
    quantity: 'Саны',
    writeoffReason: 'Есептен шығару себебі',
    unitPiece: 'дана',
    cost: 'Өзіндік құн',
    writeoffTotal: 'Есептен шығарылатын сома',
    productionDate: 'Өндірілген күні',
    expiryDate: 'Жарамдылық мерзімі',
    damageType: 'Зақым түрі',
    damageWhen: 'Қашан анықталды',
    noDeduction: 'Ұсталымсыз',
    withDeduction: 'Ұсталыммен',
    deductionEmployee: 'Ұсталым қызметкері',
    deductionReason: 'Ұсталым себебі',
    deductionPlaceholder: 'Мысалы: салғырттық',
    comment: 'Пікір',
    commentPlaceholder: 'Мысалы: тоқаш қабылдау кезінде зақымданған',
    submitForReview: 'Тексеруге жіберу',
    queueEmpty: 'Кезек бос',
    reviewQueue: 'Тексеру кезегі',
    pendingLabel: 'Тексеруде',
    selected: 'Таңдалды: {{count}}',
    clear: 'Тазалау',
    approve: 'Растау',
    reject: 'Қабылдамау',
    rejectionReason: 'Қабылдамау себебі',
    rejectionPlaceholder: 'Мысалы: фото санын растамайды',
    atCost: 'өзіндік құн бойынша',
    request: 'Өтінім',
    product: 'Өнім',
    noRequests: 'Әзірге өтінім жоқ',
    statsTitle: 'Жиынтық деректер (расталған)',
    export: 'Экспорт',
    exportTitle: 'Статистиканы экспорттау',
    totalWriteoff: 'Есептен шығару сомасы',
    totalDeductions: 'Ұсталым сомасы',
    avgWriteoff: 'Орташа есептен шығару',
    allRequests: 'Барлық өтінім',
    approvedShort: 'Раст',
    rejectedShort: 'Қайт',
    pendingShort: 'Күт',
    byOutlets: 'Нүктелер',
    employees: 'Қызметкерлер',
    reasons: 'Себептер',
    noOutletStats: 'Нүктелер бойынша дерек жоқ',
    noEmployeeStats: 'Қызметкерлер бойынша дерек жоқ',
    noReasonStats: 'Себептер бойынша дерек жоқ',
    employeeRole: 'Қызметкер',
    reviewerRole: 'Тексеруші',
    newEmployee: 'Жаңа қызметкер',
    fullName: 'Қызметкердің аты-жөні',
    city: 'Қала',
    cancel: 'Бас тарту',
    save: 'Сақтау',
    outlet: 'Нүкте',
    address: 'Мекенжай',
    amount: 'Сома',
    type: 'Түрі',
    sentBy: 'Жіберген',
    createdAt: 'Құрылған',
    reviewedBy: 'Тексерген',
    reviewedAt: 'Тексерілген',
    notSpecified: 'Көрсетілмеген',
    addressEmpty: 'Мекенжай көрсетілмеген',
    noComment: 'Пікір жоқ',
    close: 'Жабу',
    photos: 'Фото',
    micStart: 'Дауыспен',
    micStop: 'Тоқтату',
    speechProcessing: 'Танып жатырмыз...',
    speechUnsupportedTitle: 'Дауыспен енгізу',
    speechUnsupportedMessage: 'Микрофонға рұқсат беріп, қайталап көріңіз.',
    speechError: 'Сөйлеуді тану мүмкін болмады. Қайталап көріңіз.',
    pending: 'Тексеруде',
    approved: 'Расталды',
    rejected: 'Қабылданбады',
    iiko_error: 'Iiko қатесі',
  },
} as const

type TranslationKey = keyof typeof translations.ru

function t(language: Language, key: TranslationKey, params?: Record<string, string | number>) {
  let value: string = translations[language][key] ?? translations.ru[key]
  if (!params) return value
  Object.entries(params).forEach(([paramKey, paramValue]) => {
    value = value.replace(new RegExp(`{{${paramKey}}}`, 'g'), String(paramValue))
  })
  return value
}

function getStatusCopy(status: Status, language: Language) {
  return t(language, status)
}

export default function App() {
  const [fontsLoaded] = useFonts({
    GolosText_400Regular,
    GolosText_600SemiBold,
    GolosText_700Bold,
    GolosText_900Black,
  })
  const [currentUser, setCurrentUser] = useState<Employee | null>(null)
  const [language, setLanguage] = useState<Language>('ru')
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
  const [formEntryMode, setFormEntryMode] = useState<FormEntryMode>('manual')
  const [aiHint, setAiHint] = useState('')
  const [aiResult, setAiResult] = useState<AiAnalysisResult | null>(null)
  const [analyzedPhotoHash, setAnalyzedPhotoHash] = useState('')
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
    setFormEntryMode('manual')
    setAiHint('')
    setAiResult(null)
    setAnalyzedPhotoHash('')
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
      setAnalyzedPhotoHash('')
    }
  }

  async function analyzeCurrentPhoto() {
    if (!form.photoUrl) {
      Alert.alert(t(language, 'productPhoto'), t(language, 'tapToAddPhoto'))
      return
    }
    if (aiResult && analyzedPhotoHash && analyzedPhotoHash === form.photoHash) {
      Alert.alert(t(language, 'aiAnalysis'), t(language, 'analyzedPhoto'))
      return
    }
    if (!form.photoUrl.startsWith('data:image/')) {
      Alert.alert(t(language, 'aiAnalysis'), t(language, 'tapToAddPhoto'))
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
      setAnalyzedPhotoHash(form.photoHash)
      setFormStep('details')
    } catch (requestError) {
      Alert.alert(
        t(language, 'aiAnalysis'),
        requestError instanceof Error ? requestError.message : 'Не удалось проанализировать фото.',
      )
    } finally {
      setIsAnalyzing(false)
    }
  }

  async function pickCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) {
      Alert.alert(t(language, 'productPhoto'), t(language, 'tapToAddPhoto'))
      return
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      base64: true,
      quality: 0.45,
    })
    void applyImageResult(result)
  }

  async function pickGallery() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert(t(language, 'productPhoto'), t(language, 'tapToAddPhoto'))
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      base64: true,
      quality: 0.45,
    })
    void applyImageResult(result)
  }

  function choosePhotoSource() {
    Alert.alert(t(language, 'productPhoto'), t(language, 'tapToAddPhoto'), [
      {
        text: t(language, 'camera'),
        onPress: () => {
          void pickCamera()
        },
      },
      {
        text: t(language, 'gallery'),
        onPress: () => {
          void pickGallery()
        },
      },
      { text: t(language, 'cancel'), style: 'cancel' },
    ])
  }

  async function applyImageResult(result: ImagePicker.ImagePickerResult) {
    if (result.canceled) return
    try {
      const asset = result.assets[0]
      const image = await imageAssetToJpeg(asset)

      setForm((current) => ({
        ...current,
        photoUrl: image.dataUrl,
        photoName: image.name,
        photoHash: `sha256:${simpleHash(`${image.name}:${asset.uri}:${Date.now()}`)}`,
        extraPhotoUrls: formEntryMode === 'ai' ? [] : current.extraPhotoUrls,
      }))
      setAiResult(null)
      setAnalyzedPhotoHash('')
      setFormMode('initial')
    } catch (photoError) {
      Alert.alert(
        t(language, 'productPhoto'),
        photoError instanceof Error ? photoError.message : 'Не удалось подготовить фото.',
      )
    }
  }

  function removeMainPhoto() {
    setForm((current) => ({
      ...current,
      photoUrl: '',
      photoName: '',
      photoHash: '',
      extraPhotoUrls: formEntryMode === 'ai' ? [] : current.extraPhotoUrls,
    }))
    setAiResult(null)
    setAnalyzedPhotoHash('')
    setFormMode('initial')
    if (formEntryMode === 'ai') setFormStep('choose_mode')
  }

  function addExtraPhoto() {
    Alert.alert(t(language, 'productPhoto'), t(language, 'tapToAddPhoto'), [
      {
        text: t(language, 'camera'),
        onPress: async () => {
          const permission = await ImagePicker.requestCameraPermissionsAsync()
          if (!permission.granted) return
          const result = await ImagePicker.launchCameraAsync({
            allowsEditing: false,
            base64: true,
            quality: 0.45,
          })
          if (!result.canceled) {
            try {
              const asset = result.assets[0]
              const image = await imageAssetToJpeg(asset)
              setForm((current) => ({
                ...current,
                extraPhotoUrls: [...(current.extraPhotoUrls ?? []), image.dataUrl],
              }))
            } catch (photoError) {
              Alert.alert(
                t(language, 'productPhoto'),
                photoError instanceof Error ? photoError.message : 'Не удалось подготовить фото.',
              )
            }
          }
        },
      },
      {
        text: t(language, 'gallery'),
        onPress: async () => {
          const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
          if (!permission.granted) return
          const result = await ImagePicker.launchImageLibraryAsync({
            allowsEditing: false,
            base64: true,
            quality: 0.45,
          })
          if (!result.canceled) {
            try {
              const asset = result.assets[0]
              const image = await imageAssetToJpeg(asset)
              setForm((current) => ({
                ...current,
                extraPhotoUrls: [...(current.extraPhotoUrls ?? []), image.dataUrl],
              }))
            } catch (photoError) {
              Alert.alert(
                t(language, 'productPhoto'),
                photoError instanceof Error ? photoError.message : 'Не удалось подготовить фото.',
              )
            }
          }
        },
      },
      { text: t(language, 'cancel'), style: 'cancel' },
    ])
  }

  async function imageAssetToJpeg(asset: ImagePicker.ImagePickerAsset) {
    const result = await ImageManipulator.manipulateAsync(
      asset.uri,
      [],
      {
        compress: 0.55,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      },
    )
    if (!result.base64) {
      throw new Error('Не удалось подготовить фото.')
    }

    const sourceName = asset.fileName ?? `writeoff-${Date.now()}.jpg`
    const name = sourceName.replace(/\.[^.]+$/, '') + '.jpg'
    return {
      name,
      dataUrl: `data:image/jpeg;base64,${result.base64}`,
    }
  }

  function submitRequest() {
    if (!currentUser) {
      Alert.alert(t(language, 'login'), t(language, 'signIn'))
      return
    }
    const product = data.products.find((item) => item.id === form.productId)
    const quantity = Number(form.quantity)
    const comment = form.comment.trim()

    if (!form.photoUrl) {
      Alert.alert(t(language, 'productPhoto'), t(language, 'tapToAddPhoto'))
      return
    }
    if (!product || !Number.isFinite(quantity) || quantity <= 0) {
      Alert.alert(t(language, 'quantity'), t(language, 'chooseProduct'))
      return
    }
    if (comment.length < 10) {
      Alert.alert(t(language, 'comment'), t(language, 'commentPlaceholder'))
      return
    }
    if (form.type === 'with_deduction' && !form.deductionEmployeeId) {
      Alert.alert(t(language, 'withDeduction'), t(language, 'deductionEmployee'))
      return
    }

    Alert.alert(
      t(language, 'submitForReview'),
      `${product.name}\n${quantity} ${product.unit}\n${selectedReason?.name ?? t(language, 'notSpecified')}`,
      [
        { text: t(language, 'back'), style: 'cancel' },
        {
          text: t(language, 'submitForReview'),
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
      const extraPhotoUrls = form.extraPhotoUrls ?? []
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
          photoUrls: [form.photoUrl, ...extraPhotoUrls].filter(Boolean),
          photoNames: [
            form.photoName || 'photo-1.jpg',
            ...extraPhotoUrls.map((_, index) => `photo-${index + 2}.jpg`),
          ],
          photoHash: form.photoHash,
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
      setAnalyzedPhotoHash('')
      setFormMode('initial')
      setFormEntryMode('manual')
      setViewMode('mine')
      setFormStep('wizard')
      Alert.alert(t(language, 'submitForReview'), t(language, 'pendingLabel'))
    } catch (requestError) {
      Alert.alert(
        t(language, 'submitForReview'),
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
      Alert.alert(t(language, 'save'), `${newEmpName}`)
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
        t(language, 'approve'),
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
      Alert.alert(t(language, 'reject'), t(language, 'rejectionReason'))
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
        t(language, 'reject'),
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
        t(language, 'approve'),
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
            <LanguageToggle language={language} onChange={setLanguage} />
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
              <Text style={styles.muted}>{t(language, 'loading')}</Text>
            </View>
          ) : !currentUser ? (
            <LoginScreen
              loginName={loginName}
              password={password}
              authError={authError}
              isSaving={isSaving}
              language={language}
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
                  <LanguageToggle language={language} onChange={setLanguage} compact />
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
                      {currentUser.role === 'sender' ? t(language, 'sender') : t(language, 'reviewer')}
                    </Text>
                  </View>
                </View>

                {/* Logout action */}
                <Pressable style={styles.bannerLogoutBtn} onPress={logout}>
                  <Text style={styles.bannerLogoutIcon}>{'->'}</Text>
                  <Text style={styles.bannerLogoutText}>{t(language, 'logout')}</Text>
                </Pressable>
              </ImageBackground>

              {currentUser.role === 'sender' ? (
                <>
                  <View style={styles.tabs}>
                    <TabButton
                      active={viewMode === 'create'}
                      label={t(language, 'writeOff')}
                      onPress={() => setViewMode('create')}
                    />
                    <TabButton
                      active={viewMode === 'mine'}
                      label={t(language, 'myRequests')}
                      onPress={() => setViewMode('mine')}
                    />
                  </View>

                  {viewMode === 'create' ? (
                    <SenderForm
                      currentUser={currentUser}
                      data={data}
                      form={form}
                      formEntryMode={formEntryMode}
                      formMode={formMode}
                      aiHint={aiHint}
                      aiResult={aiResult}
                      analyzedPhotoHash={analyzedPhotoHash}
                      isAnalyzing={isAnalyzing}
                      isSaving={isSaving}
                      selectedProduct={selectedProduct}
                      selectedReason={selectedReason}
                      onSetField={setField}
                      onSetFormEntryMode={setFormEntryMode}
                      onHintChange={setAiHint}
                      onFormModeChange={setFormMode}
                      onAnalyze={analyzeCurrentPhoto}
                      onChoosePhoto={choosePhotoSource}
                      onRemovePhoto={removeMainPhoto}
                      onAddExtraPhoto={addExtraPhoto}
                      onSubmit={submitRequest}
                      formStep={formStep}
                      onFormStepChange={setFormStep}
                      language={language}
                    />
                  ) : (
                    <>
                      <Text style={styles.totalRequestsLabel}>
                        {t(language, 'totalRequests', { count: myRequests.length })}
                      </Text>
                      <RequestList
                        requests={myRequests}
                        products={data.products}
                        language={language}
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
                      <Text style={styles.addEmployeeTopButtonText}>{t(language, 'addEmployee')}</Text>
                    </Pressable>
                  )}

                  <View style={styles.tabs}>
                    <TabButton
                      active={viewMode === 'review'}
                      label={t(language, 'review')}
                      onPress={() => setViewMode('review')}
                    />
                    <TabButton
                      active={viewMode === 'history'}
                      label={t(language, 'history')}
                      onPress={() => setViewMode('history')}
                    />
                    <TabButton
                      active={viewMode === 'stats'}
                      label={t(language, 'stats')}
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
                      language={language}
                    />
                  ) : viewMode === 'history' ? (
                    <RequestList
                      requests={data.requests}
                      products={data.products}
                      language={language}
                      onSelect={(request) => setDetailRequestId(request.id)}
                    />
                  ) : (
                    <StatsView
                      requests={data.requests}
                      products={data.products}
                      outlets={data.outlets}
                      employees={data.employees}
                      reasons={data.reasons}
                      language={language}
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
          language={language}
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
          language={language}
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
  language,
  onLoginNameChange,
  onPasswordChange,
  onLogin,
}: {
  loginName: string
  password: string
  authError: string
  isSaving: boolean
  language: Language
  onLoginNameChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onLogin: () => void
}) {
  const [showPin, setShowPin] = useState(false)

  return (
    <View style={styles.loginContainer}>
      <Text style={styles.loginWelcomeTitle}>{t(language, 'welcome')}</Text>
      <Text style={styles.loginWelcomeSubtitle}>
        {t(language, 'loginSubtitle')}
      </Text>

      {/* Login input box */}
      <Text style={styles.loginFieldLabel}>{t(language, 'login')}</Text>
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
      <Text style={styles.loginFieldLabel}>{t(language, 'pin')}</Text>
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
          <Text style={styles.loginInputEyeText}>{showPin ? t(language, 'hide') : t(language, 'show')}</Text>
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
        <Text style={styles.loginSubmitText}>{t(language, 'signIn')}</Text>
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
          <Text style={styles.demoTitle}>{t(language, 'demoAccount')}</Text>
        </View>
        <Text style={styles.demoBodyText}>
          aibek/1234  ·  aigerim/9999{"\n"}
          manager/0000  ·  madina/2222{"\n"}
          timur/3333
        </Text>
      </View>

      {/* Footer message */}
      <View style={styles.loginFooter}>
        <Text style={styles.loginFooterText}>
          {t(language, 'accessHelp')}
        </Text>
      </View>
    </View>
  )
}

function SenderForm({
  currentUser,
  data,
  form,
  formEntryMode,
  formMode,
  aiHint,
  aiResult,
  analyzedPhotoHash,
  isAnalyzing,
  isSaving,
  selectedProduct,
  selectedReason,
  onSetField,
  onSetFormEntryMode,
  onHintChange,
  onFormModeChange,
  onAnalyze,
  onChoosePhoto,
  onRemovePhoto,
  onAddExtraPhoto,
  onSubmit,
  formStep,
  onFormStepChange,
  language,
}: {
  currentUser: Employee | null
  data: BootstrapPayload
  form: FormState
  formEntryMode: FormEntryMode
  formMode: 'initial' | 'filling'
  aiHint: string
  aiResult: AiAnalysisResult | null
  analyzedPhotoHash: string
  isAnalyzing: boolean
  isSaving: boolean
  selectedProduct?: Product
  selectedReason?: Reason
  onSetField: <K extends keyof FormState>(key: K, value: FormState[K]) => void
  onSetFormEntryMode: (mode: FormEntryMode) => void
  onHintChange: (value: string) => void
  onFormModeChange: (mode: 'initial' | 'filling') => void
  onAnalyze: () => void
  onChoosePhoto: () => void
  onRemovePhoto: () => void
  onAddExtraPhoto: () => void
  onSubmit: () => void
  formStep: 'wizard' | 'choose_mode' | 'details'
  onFormStepChange: (step: 'wizard' | 'choose_mode' | 'details') => void
  language: Language
}) {
  const progress = calculateFormProgress(form, selectedReason)
  const quantity = Number(form.quantity)
  const reasonName = selectedReason?.name.toLowerCase() ?? ''
  const needsExpiry = reasonName.includes('срок') || reasonName.includes('проср')
  const needsDamage = reasonName.includes('повреж') || reasonName.includes('порч')

  const cost = selectedProduct ? selectedProduct.cost : 0
  const totalCostAmount = selectedProduct && quantity > 0 ? quantity * selectedProduct.cost : 0

  const activeOutletName = data.outlets.find((o) => o.id === form.outletId)?.name || 'Bahandi'

  const canSubmit = progress >= 100 && !isSaving
  const currentPhotoAlreadyAnalyzed = Boolean(
    form.photoHash && analyzedPhotoHash === form.photoHash,
  )
  const canAnalyzePhoto = Boolean(form.photoUrl) && !isAnalyzing && !currentPhotoAlreadyAnalyzed
  const photoPickerLocked = formEntryMode === 'ai' && currentPhotoAlreadyAnalyzed

  // Outlet options filtered by employee's city
  const cityOutlets = data.outlets.filter((o) => o.city === currentUser?.city)

  if (formStep === 'wizard') {
    return (
      <View style={styles.wizardContainer}>
        {/* Outlet selector for sender */}
        {cityOutlets.length > 1 && (
          <View style={styles.outletSelectorBox}>
            <Text style={styles.wizardFieldLabel}>{t(language, 'chooseOutlet')}</Text>
            <OutletSearch
              outlets={cityOutlets}
              value={form.outletId}
              onChange={(id) => onSetField('outletId', id)}
              language={language}
            />
          </View>
        )}

        {/* Mode choice card */}
        <Text style={styles.wizardSectionTitle}>{t(language, 'newRequest')}</Text>
        <Text style={styles.wizardSectionSub}>{activeOutletName}</Text>

        <View style={styles.modeCardsRow}>
          {/* Manual mode card */}
          <Pressable
            style={styles.modeCard}
            onPress={() => {
              onSetFormEntryMode('manual')
              onFormStepChange('details')
            }}
          >
            <View style={[styles.modeCardIconBox, { backgroundColor: '#fff3e0' }]}>
              <View style={styles.modeCardIconLines}>
                <View style={[styles.modeIconLine, { width: 28 }]} />
                <View style={[styles.modeIconLine, { width: 20 }]} />
                <View style={[styles.modeIconLine, { width: 24 }]} />
              </View>
            </View>
            <Text style={styles.modeCardTitle}>{t(language, 'manual')}</Text>
            <Text style={styles.modeCardDesc}>{t(language, 'manualDesc')}</Text>
          </Pressable>

          {/* AI mode card */}
          <Pressable
            style={styles.modeCard}
            onPress={() => {
              onSetFormEntryMode('ai')
              onSetField('extraPhotoUrls', [])
              onFormStepChange('choose_mode')
            }}
          >
            <View style={[styles.modeCardIconBox, { backgroundColor: '#e8f5e9' }]}>
              <View style={styles.modeCardAiBrain}>
                <View style={styles.modeCardAiCircle} />
                <View style={styles.modeCardAiDot} />
                <View style={[styles.modeCardAiLine, { width: 20 }]} />
                <View style={[styles.modeCardAiLine, { width: 14 }]} />
              </View>
            </View>
            <Text style={styles.modeCardTitle}>{t(language, 'withAi')}</Text>
            <Text style={styles.modeCardDesc}>{t(language, 'withAiDesc')}</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  // AI Mode: photo + hint before going to details
  if (formStep === 'choose_mode') {
    return (
      <View style={styles.wizardContainer}>
        <Pressable onPress={() => onFormStepChange('wizard')} style={styles.detailsBackBtn}>
          <Text style={styles.detailsBackText}>‹ {t(language, 'back')}</Text>
        </Pressable>

        <Text style={styles.wizardSectionTitle}>{t(language, 'aiAnalysis')}</Text>
        <Text style={styles.wizardSectionSub}>{t(language, 'aiSubtitle')}</Text>

        {/* Photo upload block */}
        <View style={styles.aiPhotoBlock}>
          <Pressable
            onPress={() => {
              if (!photoPickerLocked) onChoosePhoto()
            }}
            style={styles.aiPhotoPressable}
          >
            {form.photoUrl ? (
              <>
                <Image source={{ uri: form.photoUrl }} style={styles.aiPhotoPreview} />
                <Pressable style={styles.photoRemoveButton} onPress={onRemovePhoto}>
                  <Text style={styles.photoRemoveText}>x</Text>
                </Pressable>
              </>
            ) : (
              <View style={styles.aiPhotoPlaceholder}>
                <View style={styles.aiCameraIcon}>
                  <View style={styles.aiCameraBody}>
                    <View style={styles.aiCameraLens} />
                  </View>
                </View>
                <Text style={styles.aiPhotoPlaceholderText}>{t(language, 'tapToAddPhoto')}</Text>
              </View>
            )}
            {!form.photoUrl && (
              <View style={styles.aiPhotoPlusBadge}>
                <Text style={styles.aiPhotoPlusText}>+</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Hint input */}
        <Text style={styles.wizardFieldLabel}>{t(language, 'aiHintLabel')}</Text>
        <TextInput
          value={aiHint}
          onChangeText={onHintChange}
          placeholder={t(language, 'aiHintPlaceholder')}
          placeholderTextColor="#999"
          style={styles.wizardTextInput}
        />

        {aiResult && <AiResultCard result={aiResult} />}

        <Pressable
          disabled={!canAnalyzePhoto}
          style={[styles.wizardProceedBtn, !canAnalyzePhoto && styles.disabledButton]}
          onPress={onAnalyze}
        >
          {isAnalyzing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.wizardProceedText}>
              {currentPhotoAlreadyAnalyzed ? t(language, 'analyzedPhoto') : t(language, 'analyzePhoto')}
            </Text>
          )}
        </Pressable>
      </View>
    )
  }

  // Details form step (Step 2)
  return (
    <View style={styles.detailsContainer}>
      {/* Back button only */}
      <Pressable
        onPress={() => onFormStepChange(formEntryMode === 'ai' ? 'choose_mode' : 'wizard')}
        style={styles.detailsBackBtn}
      >
        <Text style={styles.detailsBackText}>‹ {t(language, 'back')}</Text>
      </Pressable>

      {/* Photo upload — mandatory for both modes */}
      <Text style={styles.wizardFieldLabel}>{t(language, 'productPhoto')} <Text style={{ color: '#e53e3e' }}>*</Text></Text>
      <Pressable
        onPress={() => {
          if (!photoPickerLocked) onChoosePhoto()
        }}
        style={styles.detailsPhotoBlock}
      >
        {form.photoUrl ? (
          <>
            <Image source={{ uri: form.photoUrl }} style={styles.detailsPhotoImage} />
            <Pressable style={styles.photoRemoveButton} onPress={onRemovePhoto}>
              <Text style={styles.photoRemoveText}>x</Text>
            </Pressable>
          </>
        ) : (
          <View style={styles.detailsPhotoEmpty}>
            <View style={styles.detailsPhotoCameraBox}>
              <View style={styles.aiCameraBody}>
                <View style={styles.aiCameraLens} />
              </View>
            </View>
            <Text style={styles.detailsPhotoEmptyText}>{t(language, 'tapToAddPhoto')}</Text>
          </View>
        )}
      </Pressable>

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
          <Text style={styles.extraPhotoAddText}>{t(language, 'addPhoto')}</Text>
        </Pressable>
      </ScrollView>

      {formEntryMode === 'ai' && aiResult ? <AiResultCard result={aiResult} /> : null}

      <Text style={styles.wizardFieldLabel}>{t(language, 'chooseOutlet')}</Text>
      <OutletSearch
        outlets={cityOutlets}
        value={form.outletId}
        onChange={(id) => onSetField('outletId', id)}
        language={language}
      />

      {/* Product search input */}
      <Text style={styles.wizardFieldLabel}>{t(language, 'chooseProduct')}</Text>
      <ProductSearch
        products={data.products}
        value={form.productId}
        onChange={(val) => onSetField('productId', val)}
        language={language}
      />

      {/* Quantity entry */}
      <Text style={styles.wizardFieldLabel}>{t(language, 'quantity')}</Text>
      <View style={styles.detailsQuantityRow}>
        <TextInput
          keyboardType="decimal-pad"
          value={form.quantity}
          onChangeText={(value) => onSetField('quantity', value)}
          placeholder="0"
          style={styles.detailsQuantityInput}
        />
        <View style={styles.detailsUnitBadge}>
          <Text style={styles.detailsUnitBadgeText}>{selectedProduct?.unit ?? t(language, 'unitPiece')}</Text>
        </View>
      </View>

      {/* Cost grid side-by-side cards */}
      <View style={styles.costCardsRow}>
        <View style={styles.costCard}>
          <Text style={styles.costCardLabel}>{t(language, 'cost')}</Text>
          <Text style={styles.costCardValue}>{formatMoney(cost)}</Text>
        </View>
        <View style={styles.costCard}>
          <Text style={styles.costCardLabel}>{t(language, 'writeoffTotal')}</Text>
          <Text style={[styles.costCardValue, { color: '#097a3a' }]}>
            {formatMoney(totalCostAmount)}
          </Text>
        </View>
      </View>

      {/* Reason selector chips */}
      <Text style={styles.wizardFieldLabel}>{t(language, 'writeoffReason')}</Text>
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

      {/* Dates fields if required */}
      {needsExpiry && (
        <View style={styles.expiryGrid}>
          <View style={styles.expiryInputGroup}>
            <Text style={styles.wizardFieldLabel}>{t(language, 'productionDate')}</Text>
            <TextInput
              value={form.productionDate}
              onChangeText={(value) => onSetField('productionDate', value)}
              placeholder="2026-06-25"
              style={styles.wizardTextInput}
            />
          </View>
          <View style={styles.expiryInputGroup}>
            <Text style={styles.wizardFieldLabel}>{t(language, 'expiryDate')}</Text>
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
          <Text style={styles.wizardFieldLabel}>{t(language, 'damageType')}</Text>
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

          <Text style={styles.wizardFieldLabel}>{t(language, 'damageWhen')}</Text>
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
            {t(language, 'noDeduction')}
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
            {t(language, 'withDeduction')}
          </Text>
        </Pressable>
      </View>

      {/* Deduction items */}
      {form.type === 'with_deduction' && (
        <View style={styles.deductionFieldsContainer}>
          <Text style={styles.wizardFieldLabel}>{t(language, 'deductionEmployee')}</Text>
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

          <Text style={styles.wizardFieldLabel}>{t(language, 'deductionReason')}</Text>
          <TextInput
            value={form.deductionReason}
            onChangeText={(value) => onSetField('deductionReason', value)}
            placeholder={t(language, 'deductionPlaceholder')}
            placeholderTextColor="#999"
            style={styles.wizardTextInput}
          />
        </View>
      )}

      {/* General Comment */}
      <Text style={styles.wizardFieldLabel}>{t(language, 'comment')}</Text>
      <TextInput
        value={form.comment}
        onChangeText={(value) => onSetField('comment', value)}
        placeholder={t(language, 'commentPlaceholder')}
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
          <Text style={styles.detailsSubmitText}>{t(language, 'submitForReview')}</Text>
        )}
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
  language,
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
  language: Language
}) {
  const [isListening, setIsListening] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const recordingRef = useRef<Audio.Recording | null>(null)
  const speechRef = useRef<{ stop: () => void } | null>(null)

  useEffect(() => {
    return () => {
      speechRef.current?.stop()
      void recordingRef.current?.stopAndUnloadAsync().catch(() => undefined)
    }
  }, [])

  async function handleVoiceReason() {
    if (isListening) {
      if (Platform.OS === 'web') {
        speechRef.current?.stop()
        setIsListening(false)
        return
      }

      const recording = recordingRef.current
      recordingRef.current = null
      setIsListening(false)
      if (!recording) return

      try {
        setIsTranscribing(true)
        await recording.stopAndUnloadAsync()
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false })
        const uri = recording.getURI()
        if (!uri) throw new Error('Audio file is empty')

        const base64 = await new FileSystem.File(uri).base64()
        const result = await transcribeAudio(`data:audio/mp4;base64,${base64}`, language)
        if (result.text) {
          const nextValue = rejectionDraft.trim()
            ? `${rejectionDraft.trim()} ${result.text}`
            : result.text
          onRejectionChange(nextValue)
        }
      } catch {
        Alert.alert(t(language, 'speechUnsupportedTitle'), t(language, 'speechError'))
      } finally {
        setIsTranscribing(false)
      }
      return
    }

    if (Platform.OS !== 'web') {
      try {
        const permission = await Audio.requestPermissionsAsync()
        if (!permission.granted) {
          Alert.alert(t(language, 'speechUnsupportedTitle'), t(language, 'speechUnsupportedMessage'))
          return
        }

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        })
        const recording = new Audio.Recording()
        await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY)
        await recording.startAsync()
        recordingRef.current = recording
        setIsListening(true)
      } catch {
        Alert.alert(t(language, 'speechUnsupportedTitle'), t(language, 'speechError'))
      }
      return
    }

    type SpeechRecognitionInstance = {
      lang: string
      interimResults: boolean
      maxAlternatives: number
      start: () => void
      stop: () => void
      onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
      onerror: (() => void) | null
      onend: (() => void) | null
    }
    type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance
    const SpeechRecognition = (
      Platform.OS === 'web'
        ? ((globalThis as Record<string, unknown>).SpeechRecognition ??
          (globalThis as Record<string, unknown>).webkitSpeechRecognition)
        : undefined
    ) as SpeechRecognitionConstructor | undefined

    if (!SpeechRecognition) {
      Alert.alert(t(language, 'speechUnsupportedTitle'), t(language, 'speechUnsupportedMessage'))
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = language === 'kk' ? 'kk-KZ' : 'ru-RU'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim()
      if (transcript) {
        const nextValue = rejectionDraft.trim()
          ? `${rejectionDraft.trim()} ${transcript}`
          : transcript
        onRejectionChange(nextValue)
      }
    }
    recognition.onerror = () => {
      Alert.alert(t(language, 'speechUnsupportedTitle'), t(language, 'speechError'))
    }
    recognition.onend = () => {
      setIsListening(false)
      speechRef.current = null
    }
    speechRef.current = recognition
    setIsListening(true)
    recognition.start()
  }

  if (!request) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyTitle}>{t(language, 'queueEmpty')}</Text>
      </View>
    )
  }

  const product = products.find((item) => item.id === request.productId)
  const outlet = outlets.find((item) => item.id === request.outletId)
  const amount = product ? request.quantity * product.cost : 0
  const quickRejectReasons = language === 'kk'
    ? ['Сапасыз фото', 'Негіз жеткіліксіз', 'Жеке талқылаймыз']
    : rejectReasons

  return (
    <View style={styles.reviewPanel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>{t(language, 'reviewQueue')}</Text>
        <Text style={styles.panelDetail}>{t(language, 'pendingLabel')} · {pendingRequests.length}</Text>
      </View>

      {selectedIds.length > 0 ? (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionText}>{t(language, 'selected', { count: selectedIds.length })}</Text>
          <View style={styles.selectionActions}>
            <Pressable style={styles.selectionGhost} onPress={onClearSelection}>
              <Text style={styles.selectionGhostText}>{t(language, 'clear')}</Text>
            </Pressable>
            <Pressable
              disabled={isSaving}
              style={[styles.selectionApprove, isSaving && styles.disabledButton]}
              onPress={onBulkApprove}
            >
              <Text style={styles.selectionApproveText}>{t(language, 'approve')}</Text>
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
            language={language}
            active={item.id === request.id}
            selected={selectedIds.includes(item.id)}
            selectionMode={selectionMode}
            onPress={() => (selectionMode ? onToggleSelect(item.id) : onSelect(item.id))}
            onLongPress={() => onLongPress(item.id)}
          />
        ))}
      </View>

      <RequestPhotoBlock request={request} imageStyle={styles.reviewPhoto} />
      <Text style={styles.reviewTitle}>#{request.id} · {product?.name ?? t(language, 'product')}</Text>
      <Text style={styles.requestMeta}>{outlet?.name ?? 'Bahandi'}</Text>
      <Text style={styles.reviewInfo}>
        {request.quantity} {request.unit} · {request.type === 'with_deduction' ? t(language, 'withDeduction').toLowerCase() : t(language, 'noDeduction').toLowerCase()}
      </Text>
      {product ? (
        <Text style={styles.requestMeta}>{formatMoney(amount)} {t(language, 'atCost')}</Text>
      ) : null}
      <Text style={styles.commentText}>{request.comment}</Text>

      <View style={styles.voiceLabelRow}>
        <Text style={styles.label}>{t(language, 'rejectionReason')}</Text>
        <Pressable
          disabled={isTranscribing}
          style={[
            styles.voiceButton,
            isListening && styles.voiceButtonActive,
            isTranscribing && styles.disabledButton,
          ]}
          onPress={handleVoiceReason}
        >
          <Text style={[styles.voiceButtonText, isListening && styles.voiceButtonTextActive]}>
            {isTranscribing
              ? t(language, 'speechProcessing')
              : isListening
                ? t(language, 'micStop')
                : t(language, 'micStart')}
          </Text>
        </Pressable>
      </View>
      <TextInput
        value={rejectionDraft}
        onChangeText={onRejectionChange}
        placeholder={t(language, 'rejectionPlaceholder')}
        multiline
        style={[styles.input, styles.commentInput]}
      />

      <View style={styles.quickReasonGrid}>
        {quickRejectReasons.map((reason) => (
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
          <Text style={styles.rejectText}>{t(language, 'reject')}</Text>
        </Pressable>
        <Pressable
          disabled={isSaving}
          style={[styles.approveButton, isSaving && styles.disabledButton]}
          onPress={() => onApprove(request.id)}
        >
          <Text style={styles.approveText}>{t(language, 'approve')}</Text>
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
  language,
  active,
  selected,
  selectionMode,
  onPress,
  onLongPress,
}: {
  request: WriteOffRequest
  product?: Product
  outlet?: Outlet
  language: Language
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
        <Text style={styles.queueTitle}>#{request.id} · {product?.name ?? t(language, 'product')}</Text>
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

function getRequestPhotos(request: WriteOffRequest) {
  const photos = request.photoUrls?.length ? request.photoUrls : [request.photoUrl]
  return [...new Set(photos.filter(Boolean))]
}

function RequestPhotoBlock({
  request,
  imageStyle,
  variant = 'hero',
}: {
  request: WriteOffRequest
  imageStyle: object
  variant?: 'hero' | 'grid'
}) {
  const photos = getRequestPhotos(request)

  if (variant === 'grid' && photos.length > 1) {
    return (
      <View style={styles.requestPhotoGrid}>
        {photos.slice(0, 4).map((uri, index) => (
          <Image
            key={`${uri}-${index}`}
            source={{ uri }}
            style={[
              styles.requestPhotoGridImage,
              photos.length === 2 && styles.requestPhotoGridImageHalf,
              photos.length >= 3 && index === 0 && styles.requestPhotoGridImageLarge,
            ]}
          />
        ))}
      </View>
    )
  }

  return (
    <View style={styles.requestPhotoBlock}>
      <Image source={{ uri: photos[0] }} style={imageStyle} />
      {photos.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.requestPhotoThumbRow}>
          {photos.map((uri, index) => (
            <Image
              key={`${uri}-${index}`}
              source={{ uri }}
              style={styles.requestPhotoThumb}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  )
}

function RequestList({
  requests,
  products,
  language,
  onSelect,
}: {
  requests: WriteOffRequest[]
  products: Product[]
  language: Language
  onSelect?: (request: WriteOffRequest) => void
}) {
  return (
    <View style={styles.requestList}>
      {requests.map((request) => (
        <RequestCard
          key={request.id}
          request={request}
          productName={
            products.find((product) => product.id === request.productId)?.name ?? t(language, 'product')
          }
          language={language}
          onPress={onSelect ? () => onSelect(request) : undefined}
        />
      ))}
      {!requests.length ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>{t(language, 'noRequests')}</Text>
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

function LanguageToggle({
  language,
  onChange,
  compact = false,
}: {
  language: Language
  onChange: (language: Language) => void
  compact?: boolean
}) {
  return (
    <View style={[styles.languageToggle, compact && styles.languageToggleCompact]}>
      {(['ru', 'kk'] as Language[]).map((item) => {
        const active = item === language
        return (
          <Pressable
            key={item}
            style={[styles.languageButton, active && styles.languageButtonActive]}
            onPress={() => onChange(item)}
          >
            <Text style={[styles.languageButtonText, active && styles.languageButtonTextActive]}>
              {item === 'ru' ? 'RU' : 'KZ'}
            </Text>
          </Pressable>
        )
      })}
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
  language,
}: {
  products: Product[]
  value: string
  onChange: (id: string) => void
  language: Language
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
        placeholder={t(language, 'productSearchPlaceholder')}
        style={styles.input}
        returnKeyType="search"
      />
      {open && (
        <View style={styles.productDropdown}>
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.productDropdownScroll}>
            {filtered.length === 0 ? (
              <Text style={styles.productDropdownEmpty}>{t(language, 'noResults')}</Text>
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

function OutletSearch({
  outlets,
  value,
  onChange,
  language,
}: {
  outlets: Outlet[]
  value: string
  onChange: (id: string) => void
  language: Language
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const selected = outlets.find((outlet) => outlet.id === value)
  const normalized = query.trim().toLowerCase()
  const filtered = normalized
    ? outlets.filter((outlet) =>
      [outlet.name, outlet.address, outlet.city]
        .some((part) => part.toLowerCase().includes(normalized)),
    )
    : outlets

  function selectOutlet(id: string) {
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  return (
    <View style={styles.outletSearchBox}>
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
        placeholder={t(language, 'outletSearchPlaceholder')}
        placeholderTextColor="#999"
        style={styles.input}
        returnKeyType="search"
      />
      <Text style={styles.outletSearchHint}>
        {t(language, 'outletsAvailable', { count: outlets.length })}
      </Text>
      {open && (
        <View style={styles.outletDropdown}>
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.outletDropdownScroll}>
            {filtered.length === 0 ? (
              <Text style={styles.productDropdownEmpty}>{t(language, 'noOutletsFound')}</Text>
            ) : (
              filtered.map((outlet) => {
                const active = outlet.id === value
                return (
                  <Pressable
                    key={outlet.id}
                    style={[styles.outletDropdownItem, active && styles.productDropdownItemActive]}
                    onPress={() => selectOutlet(outlet.id)}
                  >
                    <Text style={[styles.productDropdownText, active && styles.productDropdownTextActive]}>
                      {outlet.name}
                    </Text>
                    <Text style={styles.outletDropdownAddress}>{outlet.address}</Text>
                  </Pressable>
                )
              })
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
  language,
  onPress,
}: {
  request: WriteOffRequest
  productName: string
  language: Language
  onPress?: () => void
}) {
  const photos = getRequestPhotos(request)
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
      <View style={styles.requestPhotoPreview}>
        <Image source={{ uri: photos[0] }} style={styles.requestPhoto} />
        {photos.length > 1 ? (
          <View style={styles.requestPhotoCountBadge}>
            <Text style={styles.requestPhotoCountText}>{photos.length}</Text>
          </View>
        ) : null}
      </View>
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
              {getStatusCopy(request.status, language)}
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
  language,
}: {
  requests: WriteOffRequest[]
  products: Product[]
  outlets: Outlet[]
  employees: Employee[]
  reasons: Reason[]
  language: Language
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

  async function exportStats() {
    const activeRows =
      activeTab === 'outlets'
        ? outletStats.map((item) => `${item.name}; ${item.city}; ${formatMoney(item.amount)}`)
        : activeTab === 'employees'
          ? employeeStats.map((item) => `${item.name}; ${item.role}; ${formatMoney(item.amount)}`)
          : reasonStats.map((item) => `${item.name}; ${formatMoney(item.amount)}`)

    const message = [
      t(language, 'statsTitle'),
      `${t(language, 'totalWriteoff')}: ${formatMoney(totalSum)}`,
      `${t(language, 'totalDeductions')}: ${formatMoney(deductionsSum)}`,
      `${t(language, 'avgWriteoff')}: ${formatMoney(avgRequestSum)}`,
      `${t(language, 'allRequests')}: ${totalCount}`,
      '',
      activeRows.join('\n') || '-',
    ].join('\n')

    await Share.share({
      title: t(language, 'exportTitle'),
      message,
    })
  }

  return (
    <View style={styles.statsContainer}>
      <View style={styles.statsHeaderRow}>
        <Text style={styles.statsTitleHeader}>{t(language, 'statsTitle')}</Text>
        <Pressable style={styles.statsExportButton} onPress={() => void exportStats()}>
          <Text style={styles.statsExportText}>{t(language, 'export')}</Text>
        </Pressable>
      </View>

      {/* Grid of KPI cards */}
      <View style={styles.kpiGrid}>
        <View style={[styles.kpiCard, { borderColor: '#22c55e' }]}>
          <Text style={styles.kpiLabel}>{t(language, 'totalWriteoff')}</Text>
          <Text style={[styles.kpiValue, { color: '#15803d' }]}>{formatMoney(totalSum)}</Text>
        </View>

        <View style={[styles.kpiCard, { borderColor: '#ef4444' }]}>
          <Text style={styles.kpiLabel}>{t(language, 'totalDeductions')}</Text>
          <Text style={[styles.kpiValue, { color: '#b91c1c' }]}>{formatMoney(deductionsSum)}</Text>
        </View>
      </View>

      <View style={styles.kpiGrid}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>{t(language, 'avgWriteoff')}</Text>
          <Text style={styles.kpiValue}>{formatMoney(avgRequestSum)}</Text>
        </View>

        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>{t(language, 'allRequests')}</Text>
          <Text style={styles.kpiValue}>{totalCount} {t(language, 'unitPiece')}</Text>
          <Text style={styles.kpiSubText}>
            {t(language, 'approvedShort')}: {approvedCount} · {t(language, 'rejectedShort')}: {rejectedCount} · {t(language, 'pendingShort')}: {pendingCount}
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
            {t(language, 'byOutlets')}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.statsTabBtn, activeTab === 'employees' && styles.statsTabBtnActive]}
          onPress={() => setActiveTab('employees')}
        >
          <Text style={[styles.statsTabText, activeTab === 'employees' && styles.statsTabTextActive]}>
            {t(language, 'employees')}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.statsTabBtn, activeTab === 'reasons' && styles.statsTabBtnActive]}
          onPress={() => setActiveTab('reasons')}
        >
          <Text style={[styles.statsTabText, activeTab === 'reasons' && styles.statsTabTextActive]}>
            {t(language, 'reasons')}
          </Text>
        </Pressable>
      </View>

      {/* Charts / List */}
      <View style={styles.chartPanel}>
        {activeTab === 'outlets' && (
          <>
            {outletStats.length === 0 ? (
              <Text style={styles.emptyStatsText}>{t(language, 'noOutletStats')}</Text>
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
              <Text style={styles.emptyStatsText}>{t(language, 'noEmployeeStats')}</Text>
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
                      {item.role === 'sender' ? t(language, 'employeeRole') : t(language, 'reviewerRole')}
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
              <Text style={styles.emptyStatsText}>{t(language, 'noReasonStats')}</Text>
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
  language,
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
  language: Language
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.detailSheet}>
          <ScrollView contentContainerStyle={styles.detailContent} keyboardShouldPersistTaps="handled">
            <View style={styles.detailTitleRow}>
              <Text style={styles.detailTitle}>{t(language, 'newEmployee')}</Text>
              <Pressable onPress={onClose} style={{ padding: 8 }}>
                <Text style={styles.detailCloseText}>x</Text>
              </Pressable>
            </View>

            <Text style={styles.label}>{t(language, 'fullName')}</Text>
            <TextInput
              value={name}
              onChangeText={onNameChange}
              placeholder="Иван Иванов"
              style={styles.input}
            />

            <Text style={styles.label}>{t(language, 'city')}</Text>
            <ChipGrid
              items={CITIES.map((c) => ({ id: c }))}
              value={city}
              getLabel={(item) => item.id}
              onChange={(val) => onCityChange(val)}
            />

            <Text style={styles.label}>{t(language, 'login')}</Text>
            <TextInput
              value={login}
              onChangeText={onLoginChange}
              placeholder="ivan"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />

            <Text style={styles.label}>{t(language, 'pin')} (4-6)</Text>
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
                <Text style={styles.secondaryText}>{t(language, 'cancel')}</Text>
              </Pressable>
              <Pressable
                disabled={isSaving}
                style={[styles.submitButton, isSaving && styles.disabledButton, styles.addEmpSaveBtn]}
                onPress={onSave}
              >
                {isSaving ? <ActivityIndicator color="#ffffff" /> : null}
                <Text style={styles.submitText}>{t(language, 'save')}</Text>
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
  language,
  onClose,
}: {
  request?: WriteOffRequest
  products: Product[]
  outlets: Outlet[]
  reasons: Reason[]
  employees: Employee[]
  language: Language
  onClose: () => void
}) {
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
              <RequestPhotoBlock request={request} imageStyle={styles.detailPhoto} variant="grid" />
              <View style={styles.detailTitleRow}>
                <View style={styles.detailTitleText}>
                  <Text style={styles.detailKicker}>{t(language, 'request')} #{request.id}</Text>
                  <Text style={styles.detailTitle}>{product?.name ?? t(language, 'product')}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: `${statusColor[request.status]}18` }]}>
                  <Text style={[styles.statusText, { color: statusColor[request.status] }]}>
                    {getStatusCopy(request.status, language)}
                  </Text>
                </View>
              </View>

              <View style={styles.detailGrid}>
                <DetailItem label={t(language, 'outlet')} value={outlet?.name ?? 'Bahandi'} />
                <DetailItem label={t(language, 'address')} value={outlet?.address ?? t(language, 'addressEmpty')} />
                <DetailItem label={t(language, 'quantity')} value={`${request.quantity} ${request.unit}`} />
                <DetailItem label={t(language, 'amount')} value={formatMoney(amount)} />
                <DetailItem label={t(language, 'writeoffReason')} value={reason?.name ?? t(language, 'notSpecified')} />
                <DetailItem
                  label={t(language, 'type')}
                  value={request.type === 'with_deduction' ? t(language, 'withDeduction') : t(language, 'noDeduction')}
                />
                <DetailItem label={t(language, 'sentBy')} value={sender?.name ?? request.createdById} />
                <DetailItem
                  label={t(language, 'createdAt')}
                  value={new Date(request.createdAt).toLocaleString('ru-RU')}
                />
                {reviewer ? <DetailItem label={t(language, 'reviewedBy')} value={reviewer.name} /> : null}
                {request.reviewedAt ? (
                  <DetailItem
                    label={t(language, 'reviewedAt')}
                    value={new Date(request.reviewedAt).toLocaleString('ru-RU')}
                  />
                ) : null}
              </View>

              <View style={styles.detailNote}>
                <Text style={styles.detailNoteLabel}>{t(language, 'comment')}</Text>
                <Text style={styles.detailNoteText}>{request.comment || t(language, 'noComment')}</Text>
              </View>

              {request.rejectionReason ? (
                <View style={styles.detailRejectNote}>
                  <Text style={styles.detailRejectLabel}>{t(language, 'rejectionReason')}</Text>
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
                <Text style={styles.detailCloseText}>{t(language, 'close')}</Text>
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

async function transcribeAudio(audioBase64: string, language: Language) {
  return requestJson<{ text: string }>('/ai/transcribe', {
    method: 'POST',
    body: JSON.stringify({ audioBase64, language }),
  })
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
    backgroundColor: 'transparent',
  },
  logo: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    width: IS_COMPACT_PHONE ? 166 : 190,
    height: IS_COMPACT_PHONE ? 47 : 54,
    overflow: 'hidden',
    borderWidth: IS_COMPACT_PHONE ? 5 : 6,
    borderColor: '#292929',
    backgroundColor: '#0d803d',
  },
  logoBlackLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: IS_COMPACT_PHONE ? 15 : 17,
    height: IS_COMPACT_PHONE ? 12 : 14,
    backgroundColor: '#292929',
  },
  logoStripe: {
    position: 'absolute',
    zIndex: 2,
    top: IS_COMPACT_PHONE ? 17 : 19,
    width: IS_COMPACT_PHONE ? 34 : 40,
    height: IS_COMPACT_PHONE ? 10 : 12,
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
    fontSize: IS_COMPACT_PHONE ? 30 : 34,
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
  languageToggle: {
    flexDirection: 'row',
    alignSelf: 'center',
    gap: 4,
    padding: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d8dee6',
    backgroundColor: '#ffffff',
  },
  languageToggleCompact: {
    marginLeft: 'auto',
    borderColor: 'rgba(255,255,255,0.42)',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  languageButton: {
    minWidth: IS_COMPACT_PHONE ? 34 : 38,
    minHeight: IS_COMPACT_PHONE ? 28 : 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  languageButtonActive: {
    backgroundColor: '#0d803d',
  },
  languageButtonText: {
    color: '#5f6b76',
    fontSize: 12,
    fontFamily: FONT.bold,
  },
  languageButtonTextActive: {
    color: '#ffffff',
  },
  content: {
    gap: IS_COMPACT_PHONE ? 12 : 14,
    padding: IS_COMPACT_PHONE ? 12 : 14,
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
    gap: 4,
    padding: 4,
    borderRadius: 10,
    backgroundColor: '#f8f8f8',
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: IS_COMPACT_PHONE ? 40 : 44,
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
    minHeight: IS_COMPACT_PHONE ? 44 : 48,
    paddingHorizontal: IS_COMPACT_PHONE ? 10 : 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cecece',
    backgroundColor: '#ffffff',
    color: '#212529',
    fontSize: IS_COMPACT_PHONE ? 15 : 16,
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
  requestPhotoBlock: {
    gap: 8,
  },
  requestPhotoThumbRow: {
    marginTop: 2,
  },
  requestPhotoThumb: {
    width: 70,
    height: 70,
    marginRight: 8,
    borderRadius: 10,
    backgroundColor: '#f8f8f8',
  },
  requestPhotoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  requestPhotoGridImage: {
    width: '48.9%',
    height: 112,
    borderRadius: 10,
    backgroundColor: '#f8f8f8',
  },
  requestPhotoGridImageHalf: {
    height: 145,
  },
  requestPhotoGridImageLarge: {
    width: '100%',
    height: 145,
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
  voiceLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  voiceButton: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#a9ddba',
    backgroundColor: '#e8f6ed',
  },
  voiceButtonActive: {
    borderColor: '#ff5e12',
    backgroundColor: '#fff0e8',
  },
  voiceButtonText: {
    color: '#0d803d',
    fontSize: 13,
    fontFamily: FONT.semi,
  },
  voiceButtonTextActive: {
    color: '#ff5e12',
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
  requestPhotoPreview: {
    position: 'relative',
    width: 76,
    height: 76,
  },
  requestPhotoCountBadge: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    minWidth: 24,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.68)',
  },
  requestPhotoCountText: {
    color: '#ffffff',
    fontSize: 12,
    fontFamily: FONT.bold,
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
    maxHeight: '82%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: '#ffffff',
  },
  detailContent: {
    gap: 9,
    padding: 12,
    paddingBottom: 18,
  },
  detailPhoto: {
    width: '100%',
    height: 165,
    borderRadius: 12,
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
    fontSize: 19,
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  detailItem: {
    width: '48.7%',
    gap: 3,
    padding: 8,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#dee2e6',
    backgroundColor: '#f8f8f8',
  },
  detailItemLabel: {
    color: 'rgba(0, 0, 0, 0.5)',
    fontSize: 12.5,
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  detailItemValue: {
    color: '#292929',
    fontSize: 15,
    fontWeight: '600',
    fontFamily: FONT.semi,
  },
  detailNote: {
    gap: 5,
    padding: 10,
    borderRadius: 12,
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
    fontSize: 15,
    fontFamily: FONT.regular,
    lineHeight: 21,
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
    minHeight: 46,
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
    maxHeight: IS_COMPACT_PHONE ? 190 : 220,
  },
  productDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: IS_COMPACT_PHONE ? 10 : 12,
    paddingHorizontal: IS_COMPACT_PHONE ? 12 : 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  productDropdownItemActive: {
    backgroundColor: '#f0faf4',
  },
  productDropdownText: {
    fontSize: IS_COMPACT_PHONE ? 14 : 15,
    fontFamily: FONT.regular,
    color: '#292929',
    flex: 1,
  },
  productDropdownTextActive: {
    color: '#0d803d',
    fontFamily: FONT.semi,
  },
  productDropdownUnit: {
    fontSize: 12,
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
  outletSearchBox: {
    gap: 6,
  },
  outletSearchHint: {
    color: '#718096',
    fontSize: 12,
    fontFamily: FONT.regular,
  },
  outletDropdown: {
    maxHeight: IS_COMPACT_PHONE ? 210 : 260,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dee2e6',
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  outletDropdownScroll: {
    maxHeight: 280,
  },
  outletDropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 4,
  },
  outletDropdownAddress: {
    color: '#718096',
    fontSize: 12,
    fontFamily: FONT.regular,
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
  statsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  statsTitleHeader: {
    flex: 1,
    fontSize: 18,
    fontFamily: FONT.bold,
    color: '#1a1a2e',
    marginBottom: 4,
  },
  statsExportButton: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#0d803d',
  },
  statsExportText: {
    color: '#ffffff',
    fontSize: 13,
    fontFamily: FONT.bold,
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
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: 8,
  },
  demoTitle: {
    fontSize: 15,
    fontFamily: FONT.bold,
    color: '#006c35',
  },
  demoBodyText: {
    fontSize: 14,
    fontFamily: FONT.regular,
    color: '#2e7d32',
    lineHeight: 20,
  },
  loginFooter: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 48,
    marginBottom: 20,
  },
  loginFooterText: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: '#718096',
    textAlign: 'center',
  },
  greenBannerContainer: {
    padding: IS_COMPACT_PHONE ? 12 : 14,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: IS_COMPACT_PHONE ? 12 : 14,
  },
  greenBannerImage: {
    borderRadius: 14,
  },
  bannerLogoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: IS_COMPACT_PHONE ? 6 : 8,
    marginBottom: IS_COMPACT_PHONE ? 14 : 18,
  },
  bannerLogoText: {
    fontSize: IS_COMPACT_PHONE ? 16 : 18,
    fontFamily: FONT.bold,
    color: '#ffffff',
  },
  bannerUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: IS_COMPACT_PHONE ? 9 : 12,
    marginBottom: IS_COMPACT_PHONE ? 12 : 14,
  },
  bannerAvatarCircle: {
    width: IS_COMPACT_PHONE ? 38 : 44,
    height: IS_COMPACT_PHONE ? 38 : 44,
    borderRadius: IS_COMPACT_PHONE ? 19 : 22,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerAvatarEmoji: {
    fontSize: IS_COMPACT_PHONE ? 19 : 22,
  },
  bannerUserInfo: {
    flex: 1,
    gap: 2,
  },
  bannerUserName: {
    fontSize: IS_COMPACT_PHONE ? 16 : 18,
    fontFamily: FONT.bold,
    color: '#ffffff',
  },
  bannerUserOutlet: {
    fontSize: 13,
    fontFamily: FONT.regular,
    color: '#e2e8f0',
  },
  bannerRolePill: {
    paddingVertical: IS_COMPACT_PHONE ? 3 : 4,
    paddingHorizontal: IS_COMPACT_PHONE ? 8 : 10,
    borderRadius: 12,
    backgroundColor: '#ffffff30',
  },
  bannerRoleText: {
    fontSize: IS_COMPACT_PHONE ? 11 : 12,
    fontFamily: FONT.semi,
    color: '#ffffff',
  },
  bannerLogoutBtn: {
    flexDirection: 'row',
    height: IS_COMPACT_PHONE ? 38 : 42,
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
    gap: IS_COMPACT_PHONE ? 12 : 14,
    paddingBottom: 24,
  },
  wizardSectionTitle: {
    fontSize: IS_COMPACT_PHONE ? 18 : 20,
    fontFamily: FONT.bold,
    color: '#1a202c',
    marginTop: IS_COMPACT_PHONE ? 4 : 8,
  },
  wizardSectionSub: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: '#718096',
    marginTop: -10,
  },
  // Mode selection cards
  modeCardsRow: {
    flexDirection: 'column',
    gap: 10,
    marginTop: 4,
  },
  modeCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    minHeight: IS_COMPACT_PHONE ? 126 : 136,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    paddingHorizontal: IS_COMPACT_PHONE ? 10 : 14,
    paddingVertical: IS_COMPACT_PHONE ? 12 : 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: IS_COMPACT_PHONE ? 8 : 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  modeCardIconBox: {
    width: IS_COMPACT_PHONE ? 52 : 60,
    height: IS_COMPACT_PHONE ? 52 : 60,
    borderRadius: 14,
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
    fontSize: IS_COMPACT_PHONE ? 16 : 17,
    fontFamily: FONT.bold,
    color: '#1a202c',
  },
  modeCardDesc: {
    fontSize: IS_COMPACT_PHONE ? 12 : 13,
    fontFamily: FONT.regular,
    color: '#718096',
    textAlign: 'center',
    lineHeight: IS_COMPACT_PHONE ? 15 : 17,
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
    borderRadius: 14,
    overflow: 'hidden',
  },
  aiPhotoPressable: {
    height: IS_COMPACT_PHONE ? 148 : 176,
    borderRadius: 14,
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
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: IS_COMPACT_PHONE ? 8 : 10,
  },
  aiCameraIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiCameraBody: {
    width: IS_COMPACT_PHONE ? 42 : 48,
    height: IS_COMPACT_PHONE ? 32 : 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 3,
    borderColor: '#a0aec0',
  },
  aiCameraLens: {
    width: IS_COMPACT_PHONE ? 14 : 16,
    height: IS_COMPACT_PHONE ? 14 : 16,
    borderRadius: IS_COMPACT_PHONE ? 7 : 8,
    borderWidth: 3,
    borderColor: '#a0aec0',
  },
  aiPhotoPlaceholderText: {
    fontSize: IS_COMPACT_PHONE ? 12 : 14,
    fontFamily: FONT.regular,
    color: '#a0aec0',
    marginTop: 6,
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
  photoRemoveButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.64)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRemoveText: {
    color: '#ffffff',
    fontSize: 16,
    fontFamily: FONT.bold,
    lineHeight: 18,
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
    fontSize: IS_COMPACT_PHONE ? 13 : 14,
    fontFamily: FONT.semi,
    color: '#292929',
    marginTop: 8,
    marginBottom: 6,
  },
  wizardTextInput: {
    height: IS_COMPACT_PHONE ? 46 : 50,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    paddingHorizontal: IS_COMPACT_PHONE ? 12 : 14,
    fontSize: IS_COMPACT_PHONE ? 14 : 15,
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
    height: IS_COMPACT_PHONE ? 48 : 52,
    borderRadius: 12,
    backgroundColor: '#006c35',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: IS_COMPACT_PHONE ? 12 : 16,
    paddingHorizontal: 16,
  },
  wizardProceedText: {
    flex: 1,
    textAlign: 'center',
    color: '#ffffff',
    fontSize: IS_COMPACT_PHONE ? 14 : 16,
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
    gap: IS_COMPACT_PHONE ? 12 : 14,
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
    height: IS_COMPACT_PHONE ? 140 : 165,
    borderRadius: 14,
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
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  detailsPhotoCameraBox: {
    alignItems: 'center',
  },
  detailsPhotoEmptyText: {
    fontSize: IS_COMPACT_PHONE ? 12 : 14,
    fontFamily: FONT.regular,
    color: '#a0aec0',
  },
  extraPhotosRow: {
    flexDirection: 'row',
    marginTop: -4,
  },
  extraPhotoThumb: {
    width: IS_COMPACT_PHONE ? 68 : 76,
    height: IS_COMPACT_PHONE ? 68 : 76,
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
    width: IS_COMPACT_PHONE ? 68 : 76,
    height: IS_COMPACT_PHONE ? 68 : 76,
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
    fontSize: IS_COMPACT_PHONE ? 15 : 17,
    fontFamily: FONT.bold,
    color: '#a0aec0',
    textAlign: 'center',
    lineHeight: 22,
  },
  detailsQuantityRow: {
    flexDirection: 'row',
    gap: IS_COMPACT_PHONE ? 8 : 12,
  },
  detailsQuantityInput: {
    flex: 1,
    height: IS_COMPACT_PHONE ? 46 : 50,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    paddingHorizontal: IS_COMPACT_PHONE ? 12 : 16,
    fontSize: IS_COMPACT_PHONE ? 15 : 16,
    fontFamily: FONT.semi,
    color: '#2d3748',
  },
  detailsUnitBadge: {
    height: IS_COMPACT_PHONE ? 46 : 50,
    paddingHorizontal: IS_COMPACT_PHONE ? 12 : 16,
    borderRadius: 10,
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
    paddingVertical: IS_COMPACT_PHONE ? 8 : 10,
    paddingHorizontal: IS_COMPACT_PHONE ? 12 : 14,
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
    fontSize: IS_COMPACT_PHONE ? 12.5 : 13.5,
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
    gap: IS_COMPACT_PHONE ? 8 : 12,
    marginTop: 8,
  },
  costCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: IS_COMPACT_PHONE ? 11 : 14,
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
    height: IS_COMPACT_PHONE ? 78 : 90,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    paddingHorizontal: IS_COMPACT_PHONE ? 12 : 16,
    paddingTop: 12,
    fontSize: IS_COMPACT_PHONE ? 14 : 15,
    fontFamily: FONT.regular,
    color: '#2d3748',
    textAlignVertical: 'top',
  },
  detailsSubmitBtn: {
    flexDirection: 'row',
    height: IS_COMPACT_PHONE ? 48 : 52,
    borderRadius: 12,
    backgroundColor: '#006c35',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: IS_COMPACT_PHONE ? 12 : 16,
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
