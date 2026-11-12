import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import {
  loadCachedProfile,
  readJson,
  saveCachedProfile,
  scopedStore,
  screenFor,
  writeJson,
  type KeyValueStore,
  type Profile,
} from './lib/profile'
import type { AuthClient } from './lib/auth'
import {
  createInvite,
  createMyInvite,
  decideCollector,
  fetchOwnProfile,
  listCollectors,
  listInvites,
  listMyInvites,
  revokeInvite,
  revokeMyInvite,
  showInvite,
} from './data/collectors'
import {
  deletePractice,
  fetchGate,
  insertPractice,
  listPhoneChecks,
  saveDeviceCheck,
  saveSettingsRemote,
} from './data/fieldwork'
import { flushSettings, loadPendingSettings, saveSettings, withSettings, type Settings } from './lib/settings'
import { flushPractice, loadWaiting, mergePractice, removePractice, type PracticeApi } from './lib/practice'
import { runPhoneCheck, type PhoneCheckResult } from './lib/phonecheck'
import type { ShareEnv } from './lib/invite'
import { browserCheckEnv } from './browserEnv'
import { Invite, type InviteApi } from './screens/Invite'
import { InstallArea } from './components/InstallArea'
import { Page, Title } from './components/ui'
import { Join } from './screens/Join'
import { SignIn } from './screens/SignIn'
import { Admin, type AdminApi } from './screens/Admin'
import { SettingsScreen } from './screens/Settings'
import { PhoneCheck } from './screens/PhoneCheck'
import { PracticeList } from './screens/Practice'
import { ConsentFlow } from './screens/Consent'
import { MeasureFlow, type MeasureStore } from './screens/Measure'
import { fetchEntries, measureApi } from './data/measure'
import {
  finishDraft,
  flushMeasurements,
  loadDraft,
  saveAbout as saveAboutLocal,
  saveEntry as saveEntryLocal,
  saveWeightLocal,
  saveToldHeightLocal,
  saveToldWeightLocal,
  startDraft,
  waitingOps,
  type MeasureDraft,
} from './lib/measureQueue'
import { consentApi, listMine, previewWithdraw, withdraw } from './data/consent'
import { photoApi } from './data/photos'
import { finishPhotos, flushPhotos, savePhoto, waitingPhotos } from './lib/photoQueue'
import { PhotoFlow } from './screens/Photos'
import { browserCameraEnv } from './cameraEnv'
import { consentText } from './lib/consentText'
import { FieldDb, flushConsents, saveJob, waitingCount as queuedCount, waitingJobs, type ConsentJob } from './lib/consentQueue'
import type { PracticeRow } from './lib/practice'
import { useBackButton } from './lib/backButton'
import { Home, Inactive, RealComingSoon, Waiting, Welcome } from './screens/Status'

/** Where the phone's Back goes from each screen (see src/lib/backButton.ts). */
export function parentView(v: View): View {
  return v === 'measure' || v === 'photos' ? 'practice-list' : 'main'
}

export type View =
  | 'main'
  | 'join'
  | 'signin'
  | 'admin'
  | 'invite'
  | 'settings'
  | 'check'
  | 'practice-new'
  | 'practice-list'
  | 'real'
  | 'measure'
  | 'photos'

export interface AppViewProps {
  profile: Profile | null
  view: View
  online: boolean
  setView: (v: View) => void
  onAuthChanged: () => void
  onSignOut: () => void
  /** F2/F3 facts shown on Home. */
  collectionOpen?: boolean
  waiting?: number
  lastCheck?: { passed: boolean; checkedAt: string } | null
  join: ReactNode
  signIn: ReactNode
  admin: ReactNode
  invite: ReactNode
  install: ReactNode
  setup?: ReactNode
  settings?: ReactNode
  check?: ReactNode
  practiceNew?: ReactNode
  practiceList?: ReactNode
  /** F4: the real-participant flow (only reachable once collection is open). */
  real?: ReactNode
  /** F5: measuring one participant. */
  measure?: ReactNode
  /** F6: photos of one participant. */
  photos?: ReactNode
}

/** Pure routing: which screen for this profile and view (tested on its own). */
export function AppView(p: AppViewProps) {
  const screen = screenFor(p.profile)
  if (screen === 'welcome') {
    if (p.view === 'join') return <>{p.join}</>
    if (p.view === 'signin') return <>{p.signIn}</>
    return <Welcome onSignIn={() => p.setView('signin')} onJoin={() => p.setView('join')} install={p.install} />
  }
  if (screen === 'waiting')
    return <Waiting profile={p.profile!} online={p.online} onCheck={p.onAuthChanged} onSignOut={p.onSignOut} />
  if (screen === 'inactive') return <Inactive onSignOut={p.onSignOut} />
  if (screen === 'setup') return <>{p.setup}</>
  const open = p.collectionOpen === true
  if (p.view === 'admin' && p.profile!.role === 'admin') return <>{p.admin}</>
  if (p.view === 'invite') return <>{p.invite}</>
  if (p.view === 'settings') return <>{p.settings}</>
  if (p.view === 'check') return <>{p.check}</>
  if (p.view === 'practice-new') return <>{p.practiceNew}</>
  if (p.view === 'practice-list') return <>{p.practiceList}</>
  if (p.view === 'measure' && p.measure) return <>{p.measure}</>
  if (p.view === 'photos' && p.photos) return <>{p.photos}</>
  if (p.view === 'real' && open) return <>{p.real ?? <RealComingSoon onBack={() => p.setView('main')} />}</>
  return (
    <Home
      profile={p.profile!}
      online={p.online}
      collectionOpen={open}
      waiting={p.waiting ?? 0}
      lastCheck={p.lastCheck ?? null}
      onPracticeNew={() => p.setView('practice-new')}
      onPracticeList={() => p.setView('practice-list')}
      onRealNew={() => p.setView('real')}
      onCheck={() => p.setView('check')}
      onSettings={() => p.setView('settings')}
      onAdmin={() => p.setView('admin')}
      onInvite={() => p.setView('invite')}
      onSignOut={p.onSignOut}
      install={p.install}
    />
  )
}

// Created once: the Supabase client never changes, so screens load their lists once.
const db = supabase as SupabaseClient
const inviteApi: InviteApi | null = supabase
  ? {
      list: () => listMyInvites(db),
      create: () => createMyInvite(db),
      revoke: (id) => revokeMyInvite(db, id),
    }
  : null

const adminApi: AdminApi | null = supabase
  ? {
      listCollectors: () => listCollectors(db),
      decide: (id, d) => decideCollector(db, id, d),
      listInvites: () => listInvites(db),
      createInvite: (label, uses, days) => createInvite(db, label, uses, days),
      showInvite: (id) => showInvite(db, id),
      revokeInvite: (id) => revokeInvite(db, id),
      listPhoneChecks: () => listPhoneChecks(db),
      previewWithdraw: (r) => previewWithdraw(db, r),
      withdraw: (r) => withdraw(db, r),
    }
  : null

const sendConsent = supabase ? consentApi(db) : null
const sendMeasure = supabase ? measureApi(db) : null
const sendPhotos = supabase ? photoApi(db) : null
const cameraEnv = browserCameraEnv()

/** IndexedDB can be missing (private browsing, very old phones): the phone check reports it. */
const fieldDb: FieldDb | null = (() => {
  try {
    return typeof indexedDB !== 'undefined' ? new FieldDb() : null
  } catch {
    return null
  }
})()

/** A job still on the phone, shown in the list without its name. */
const jobRow = (j: ConsentJob): PracticeRow => ({
  id: j.participantId,
  practiceNo: null,
  ageGroup: j.ageGroup,
  status: j.rejected ? 'rejected' : 'draft',
  createdAt: j.createdAt,
  waiting: true,
  receiptCode: j.rejected ? null : j.receiptCode,
  hasConsent: false,
  intimateOk: j.consent?.agreedIntimate === true,
  weightOk: j.consent?.agreedWeight === true,
})

const practiceApi: PracticeApi = {
  insert: (p) => insertPractice(db, p),
  remove: (id) => deletePractice(db, id),
}

const shareEnv: ShareEnv = {
  share: typeof navigator !== 'undefined' && typeof navigator.share === 'function' ? (d) => navigator.share(d) : undefined,
  copy: typeof navigator !== 'undefined' && navigator.clipboard ? (t) => navigator.clipboard.writeText(t) : undefined,
}

const storage: KeyValueStore | undefined = (() => {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
})()

const OPEN_KEY = 'anthro-collect.collection-open.v1'
const VERSION_KEY = 'anthro-collect.consent-version.v1'
const LAST_CHECK = 'anthro-collect.last-check.v1'
const CHECK_PENDING = 'anthro-collect.check-pending.v1'

/** Everything waiting on this phone for one collector: settings, practice records, a phone check. */
function waitingCount(store: KeyValueStore | undefined): number {
  return (
    (loadPendingSettings(store) ? 1 : 0) +
    loadWaiting(store).length +
    (readJson<PhoneCheckResult | null>(store, CHECK_PENDING, null) ? 1 : 0)
  )
}

async function flushCheck(store: KeyValueStore | undefined): Promise<boolean> {
  const pending = readJson<PhoneCheckResult | null>(store, CHECK_PENDING, null)
  if (!pending) return true
  try {
    await saveDeviceCheck(db, pending)
    writeJson(store, CHECK_PENDING, null)
    return true
  } catch {
    return false
  }
}

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(() => loadCachedProfile(storage))
  const [view, setView] = useState<View>('main')
  useBackButton(view, setView, parentView, 'main')
  const [online, setOnline] = useState(navigator.onLine)
  const [collectionOpen, setCollectionOpen] = useState(() => readJson<boolean>(storage, OPEN_KEY, false) === true)
  const [consentVersion, setConsentVersion] = useState<string | null>(() => readJson<string | null>(storage, VERSION_KEY, null))
  const [queued, setQueued] = useState(0)
  const [tick, setTick] = useState(0)
  const bump = useCallback(() => setTick((t) => t + 1), [])

  const mine = useMemo(() => (profile ? scopedStore(storage, profile.id) : undefined), [profile])


  /** Latest profile from the server, null when signed out, or 'keep' (offline / server trouble). */
  const loadProfile = useCallback(async (): Promise<
    { profile: Profile | null; gate: { open: boolean; consentVersion: string | null } | null } | 'keep'
  > => {
    if (!supabase) return 'keep'
    const { data } = await supabase.auth.getSession()
    if (!data.session) {
      // Only forget the collector when we know they are signed out (not merely offline).
      return navigator.onLine ? { profile: null, gate: null } : 'keep'
    }
    try {
      const p = await fetchOwnProfile(supabase)
      if (p && p.status === 'approved') {
        // Send what waited on this phone first, then read the latest.
        const store = scopedStore(storage, p.id)
        await flushSettings(store, (s) => saveSettingsRemote(db, p.id, s))
        await flushPractice(store, practiceApi)
        await flushCheck(store)
        if (fieldDb && sendConsent) await flushConsents(fieldDb, p.id, sendConsent).catch(() => 0)
        // Measurements after consents: the database refuses them without consent.
        if (fieldDb && sendMeasure) await flushMeasurements(fieldDb, p.id, sendMeasure).catch(() => 0)
        // Photos last: the Worker and database refuse them before consent and finished measurements.
        if (fieldDb && sendPhotos) await flushPhotos(fieldDb, p.id, sendPhotos).catch(() => 0)
        const gate = await fetchGate(db).catch(() => null)
        return { profile: withSettings(p, loadPendingSettings(store)), gate }
      }
      return { profile: p, gate: null }
    } catch {
      return 'keep'
    }
  }, [])

  const refresh = useCallback(() => {
    void loadProfile().then((r) => {
      if (r === 'keep') return
      setProfile(r.profile)
      saveCachedProfile(storage, r.profile)
      if (r.gate) {
        setCollectionOpen(r.gate.open)
        setConsentVersion(r.gate.consentVersion)
        writeJson(storage, OPEN_KEY, r.gate.open)
        writeJson(storage, VERSION_KEY, r.gate.consentVersion)
      }
      bump()
    })
  }, [loadProfile, bump])

  useEffect(() => {
    const up = () => {
      setOnline(true)
      refresh()
    }
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    refresh()
    const sub = supabase?.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setProfile(null)
        saveCachedProfile(storage, null)
      }
    })
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
      sub?.data.subscription.unsubscribe()
    }
  }, [refresh])

  const afterAuth = useCallback(() => {
    setView('main')
    refresh()
  }, [refresh])

  const signOut = useCallback(async () => {
    // Anything still waiting stays on this phone under this collector's id, for their next sign-in.
    setProfile(null)
    saveCachedProfile(storage, null)
    setView('main')
    await supabase?.auth.signOut().catch(() => undefined)
  }, [])

  const onSaveSettings = useCallback(
    async (s: Settings) => {
      if (!profile) return 'waiting' as const
      const result = await saveSettings(mine, s, (x) => saveSettingsRemote(db, profile.id, x))
      const next = withSettings(profile, s)
      setProfile(next)
      saveCachedProfile(storage, next)
      bump()
      return result
    },
    [profile, mine, bump],
  )

  const practiceLoad = useCallback(async () => {
    if (!profile) return []
    const server = await listMine(db, true).catch(() => [])
    const jobs = fieldDb ? (await waitingJobs(fieldDb, profile.id).catch(() => [])).filter((j) => j.isPractice) : []
    const known = new Set(server.map((r) => r.id))
    // Photos finished on this phone and still waiting to send count as done here.
    const doneHere = fieldDb ? new Set((await fieldDb.photoDone.where('collectorId').equals(profile.id).toArray().catch(() => [])).map((d) => d.participantId)) : new Set<string>()
    for (const r of server) if (doneHere.has(r.id)) r.photosDone = true
    return mergePractice([...server, ...jobs.filter((j) => !known.has(j.participantId)).map(jobRow)], loadWaiting(mine))
  }, [mine, profile])

  // Consents waiting on this phone (IndexedDB is async, so it is counted in the background).
  useEffect(() => {
    let alive = true
    if (fieldDb && profile) {
      void Promise.all([queuedCount(fieldDb, profile.id), waitingOps(fieldDb, profile.id), waitingPhotos(fieldDb, profile.id)])
        .then(([c, m, f]) => {
          if (alive) setQueued(c + m + f)
        })
        .catch(() => undefined)
    }
    return () => {
      alive = false
    }
  }, [profile, tick])

  // F5: the participant being measured, and how its changes are kept and sent.
  const [measuring, setMeasuring] = useState<MeasureDraft | null>(null)
  const sendAll = useCallback(
    (collectorId: string) => {
      if (!fieldDb) return
      void (async () => {
        if (sendConsent) await flushConsents(fieldDb, collectorId, sendConsent).catch(() => 0)
        if (sendMeasure) await flushMeasurements(fieldDb, collectorId, sendMeasure).catch(() => 0)
        if (sendPhotos) await flushPhotos(fieldDb, collectorId, sendPhotos).catch(() => 0)
      })().then(bump, bump)
    },
    [bump],
  )
  const measureStore: MeasureStore = useMemo(
    () => ({
      about: async (d, a) => {
        const next = await saveAboutLocal(fieldDb!, d, a)
        bump()
        sendAll(d.collectorId)
        return next
      },
      entry: async (d, e) => {
        const next = await saveEntryLocal(fieldDb!, d, e)
        bump()
        sendAll(d.collectorId)
        return next
      },
      finish: async (d) => {
        const next = await finishDraft(fieldDb!, d, new Date().toISOString())
        bump()
        sendAll(d.collectorId)
        return next
      },
      weight: async (d, w) => {
        const next = await saveWeightLocal(fieldDb!, d, w)
        bump()
        sendAll(d.collectorId)
        return next
      },
      toldHeight: async (d, typed, unit) => {
        const next = await saveToldHeightLocal(fieldDb!, d, typed, unit)
        bump()
        sendAll(d.collectorId)
        return next
      },
      toldWeight: async (d, kg) => {
        const next = await saveToldWeightLocal(fieldDb!, d, kg)
        bump()
        sendAll(d.collectorId)
        return next
      },
    }),
    [bump, sendAll],
  )
  const openMeasure = useCallback(
    async (
      m: { participantId: string; isPractice: boolean; ageGroup: 'adult' | 'child'; intimateOk: boolean; weightOk: boolean },
      fresh = false,
    ) => {
      if (!fieldDb || !profile) return
      let draft = await loadDraft(fieldDb, m.participantId)
      if (!draft) {
        // Measured before on another visit: start from what the server has (own participants only).
        // Not for a consent just made (nothing on the server), and never waiting long for a bad signal.
        const entries =
          fresh || !navigator.onLine
            ? {}
            : await Promise.race([
                fetchEntries(db, m.participantId).catch(() => ({})),
                new Promise<Record<string, never>>((resolve) => setTimeout(() => resolve({}), 4000)),
              ])
        draft = await startDraft(fieldDb, { ...m, collectorId: profile.id, entries })
      }
      setMeasuring(draft)
      setView('measure')
    },
    [profile],
  )

  // F6: the participant being photographed.
  const [photographing, setPhotographing] = useState<{
    participantId: string
    sex: 'female' | 'male' | null
    ageGroup: 'adult' | 'child'
    fromFinish: boolean
  } | null>(null)
  const openPhotos = useCallback((p: { participantId: string; sex: 'female' | 'male' | null; ageGroup: 'adult' | 'child' }, fromFinish: boolean) => {
    setPhotographing({ ...p, fromFinish })
    setView('photos')
  }, [])

  const saveConsent = useCallback(
    async (job: ConsentJob) => {
      if (!fieldDb) throw new Error('no_offline_storage')
      await saveJob(fieldDb, job)
      bump()
      if (sendConsent) void flushConsents(fieldDb, job.collectorId, sendConsent).then(bump, bump)
    },
    [bump],
  )

  const lastCheck = useMemo(
    () => readJson<{ passed: boolean; checkedAt: string; phoneModel?: string | null } | null>(mine, LAST_CHECK, null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read after every change (tick)
    [mine, tick],
  )
  const waiting = useMemo(
    () => waitingCount(mine),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read after every change (tick)
    [mine, tick],
  )

  if (!supabase) {
    return (
      <Page>
        <Title>Anthro Collect</Title>
        <p>The login service is not configured yet.</p>
        <InstallArea />
      </Page>
    )
  }

  const authClient = db as unknown as AuthClient
  const home = () => {
    setView('main')
    bump()
  }
  const settingsValue = profile ? { unit: profile.unit, language: profile.language } : { unit: 'cm' as const, language: 'en' as const }

  return (
    <AppView
      profile={profile}
      view={view}
      online={online}
      setView={setView}
      onAuthChanged={refresh}
      onSignOut={() => void signOut()}
      collectionOpen={collectionOpen}
      waiting={waiting + queued}
      lastCheck={lastCheck}
      join={<Join client={authClient} onJoined={afterAuth} onBack={() => setView('main')} />}
      signIn={<SignIn client={authClient} onSignedIn={afterAuth} onBack={() => setView('main')} />}
      setup={<SettingsScreen first initial={settingsValue} onSave={onSaveSettings} onDone={home} />}
      settings={
        <SettingsScreen first={false} initial={settingsValue} onSave={onSaveSettings} onDone={home} onBack={home} />
      }
      check={
        <PhoneCheck
          run={() => runPhoneCheck(browserCheckEnv())}
          save={async (r) => {
            writeJson(mine, LAST_CHECK, { passed: r.passed, checkedAt: r.checkedAt, phoneModel: r.phoneModel })
            writeJson(mine, CHECK_PENDING, r)
            const sent = await flushCheck(mine)
            bump()
            return sent
          }}
          onBack={home}
        />
      }
      practiceNew={
        profile ? (
          <ConsentFlow
            key={`practice-${view}`}
            isPractice
            text={consentText('practice')!}
            collectorId={profile.id}
            onSave={saveConsent}
            onDone={() => setView('practice-list')}
            onBack={home}
            onMeasure={(m) => void openMeasure(m, true)}
          />
        ) : null
      }
      real={
        profile && consentText(consentVersion) ? (
          <ConsentFlow
            key={`real-${view}`}
            isPractice={false}
            text={consentText(consentVersion)!}
            collectorId={profile.id}
            onSave={saveConsent}
            onDone={home}
            onBack={home}
            onMeasure={(m) => void openMeasure(m, true)}
          />
        ) : undefined
      }
      measure={
        measuring && profile ? (
          <MeasureFlow
            key={measuring.participantId}
            draft={measuring}
            unit={profile.unit}
            store={measureStore}
            onDone={() =>
              openPhotos({ participantId: measuring.participantId, sex: measuring.about?.sex ?? null, ageGroup: measuring.ageGroup }, true)
            }
            onBack={() => setView('practice-list')}
          />
        ) : undefined
      }
      photos={
        photographing && profile && fieldDb ? (
          <PhotoFlow
            key={photographing.participantId}
            participant={photographing}
            env={{ ...cameraEnv, phoneModel: lastCheck?.phoneModel ?? null }}
            fromFinish={photographing.fromFinish}
            save={async (slot, shot) => {
              await savePhoto(fieldDb, { collectorId: profile.id, participantId: photographing.participantId, slot, phoneModel: lastCheck?.phoneModel ?? null }, shot)
              bump()
              sendAll(profile.id)
            }}
            finish={async () => {
              await finishPhotos(fieldDb, profile.id, photographing.participantId)
              bump()
              sendAll(profile.id)
            }}
            onDone={() => setView('practice-list')}
            onLater={() => setView('practice-list')}
          />
        ) : undefined
      }
      practiceList={
        <PracticeList
          load={practiceLoad}
          remove={async (row) => {
            await removePractice(mine, practiceApi, row)
            bump()
          }}
          onNew={() => setView('practice-new')}
          onBack={home}
          onMeasure={(r) =>
            void openMeasure({
              participantId: r.id,
              isPractice: true,
              ageGroup: r.ageGroup,
              intimateOk: r.intimateOk === true,
              weightOk: r.weightOk === true,
            })
          }
          onPhotos={(r) => openPhotos({ participantId: r.id, sex: r.sex ?? null, ageGroup: r.ageGroup }, false)}
        />
      }
      admin={
        profile ? (
          <Admin api={adminApi!} myId={profile.id} appUrl={window.location.origin} shareEnv={shareEnv} onBack={home} />
        ) : null
      }
      invite={
        <Invite api={inviteApi!} appUrl={window.location.origin} shareEnv={shareEnv} online={online} onBack={home} />
      }
      install={<InstallArea />}
    />
  )
}
