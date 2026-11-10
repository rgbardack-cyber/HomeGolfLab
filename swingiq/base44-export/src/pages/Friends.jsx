import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, UserPlus, Trophy, Check, X, Search, Plus, Loader2, Calendar } from 'lucide-react';
import FriendAvatar from '@/components/friends/FriendAvatar';
import InviteCard from '@/components/friends/InviteCard';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLang } from '@/lib/i18n.jsx';
import { format } from 'date-fns';

function CreateChallengeModal({ friends, myEmail, onClose }) {
  const { t } = useLang();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [fee, setFee] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);

  const toggle = (email) => setSelected(prev => prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]);

  const handleCreate = async () => {
    setSaving(true);
    await base44.entities.PrivateChallenge.create({
      title,
      creator_email: myEmail,
      participant_emails: selected,
      entry_fee: parseFloat(fee),
      total_pool: parseFloat(fee),
      start_date: startDate,
      end_date: endDate,
      status: 'open',
      winner_pct: 80,
      app_pct: 20,
    });
    qc.invalidateQueries({ queryKey: ['private-challenges'] });
    setSaving(false);
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-card rounded-2xl border border-border p-6 w-full max-w-md space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-semibold text-lg">{t('createPrivateChallenge')}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-3 rounded-xl bg-accent/10 border border-accent/20 text-sm text-center font-medium text-accent">
          {t('winnerGets')}
        </div>

        <div className="space-y-3">
          <div>
            <Label>{t('challengeName')}</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} className="mt-1" placeholder="Ej: Reto Juego Corto - Junio" />
          </div>
          <div>
            <Label>{t('entryFee')}</Label>
            <Input type="number" value={fee} onChange={e => setFee(e.target.value)} className="mt-1" placeholder="20" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Inicio</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Fin</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="mt-1" />
            </div>
          </div>
        </div>

        <div>
          <Label className="block mb-2">{t('participants')}</Label>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {friends.map(f => (
              <button
                key={f.friend_email}
                onClick={() => toggle(f.friend_email)}
                className={`w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all ${selected.includes(f.friend_email) ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'}`}
              >
                <FriendAvatar email={f.friend_email} name={f.friend_name} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{f.friend_name || f.friend_email}</p>
                  <p className="text-xs text-muted-foreground truncate">{f.friend_email}</p>
                </div>
                {selected.includes(f.friend_email) && <Check className="w-4 h-4 text-primary shrink-0" />}
              </button>
            ))}
            {friends.length === 0 && <p className="text-sm text-muted-foreground text-center py-2">{t('nofriends')}</p>}
          </div>
        </div>

        <Button
          onClick={handleCreate}
          disabled={!title || !fee || selected.length === 0 || saving}
          className="w-full"
        >
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trophy className="w-4 h-4 mr-2" />}
          {t('createChallenge')}
        </Button>
      </motion.div>
    </motion.div>
  );
}

export default function Friends() {
  const { t } = useLang();
  const qc = useQueryClient();
  const [searchEmail, setSearchEmail] = useState('');
  const [searching, setSearching] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const { data: user } = useQuery({ queryKey: ['me'], queryFn: () => base44.auth.me() });

  const { data: sentRequests = [] } = useQuery({
    queryKey: ['sent-requests'],
    queryFn: async () => {
      if (!user?.email) return [];
      return base44.entities.Friendship.filter({ requester_email: user.email });
    },
    enabled: !!user?.email,
  });

  const { data: receivedRequests = [] } = useQuery({
    queryKey: ['received-requests'],
    queryFn: async () => {
      if (!user?.email) return [];
      return base44.entities.Friendship.filter({ receiver_email: user.email });
    },
    enabled: !!user?.email,
  });

  const { data: privateChallenges = [] } = useQuery({
    queryKey: ['private-challenges'],
    queryFn: async () => {
      if (!user?.email) return [];
      const asCreator = await base44.entities.PrivateChallenge.filter({ creator_email: user.email });
      return asCreator;
    },
    enabled: !!user?.email,
  });

  const friends = [
    ...sentRequests.filter(r => r.status === 'accepted').map(r => ({ friend_email: r.receiver_email, friend_name: r.receiver_name })),
    ...receivedRequests.filter(r => r.status === 'accepted').map(r => ({ friend_email: r.requester_email, friend_name: r.requester_name })),
  ];

  const pending = receivedRequests.filter(r => r.status === 'pending');

  const sendInvite = async () => {
    if (!searchEmail || !user) return;
    setSearching(true);
    await base44.entities.Friendship.create({
      requester_email: user.email,
      requester_name: user.full_name || user.email,
      receiver_email: searchEmail.trim().toLowerCase(),
      status: 'pending',
    });
    qc.invalidateQueries({ queryKey: ['sent-requests'] });
    setInviteSent(true);
    setSearchEmail('');
    setSearching(false);
    setTimeout(() => setInviteSent(false), 3000);
  };

  const respond = async (id, status) => {
    await base44.entities.Friendship.update(id, { status, receiver_name: user?.full_name || user?.email });
    qc.invalidateQueries({ queryKey: ['received-requests'] });
    qc.invalidateQueries({ queryKey: ['sent-requests'] });
  };

  return (
    <div className="space-y-6 pb-24 lg:pb-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-heading text-2xl font-bold">{t('friendsTitle')}</h1>
              <p className="text-sm text-muted-foreground">{t('friendChallenges')}</p>
            </div>
          </div>
          {friends.length > 0 && (
            <Button size="sm" onClick={() => setShowCreate(true)} className="gap-2">
              <Trophy className="w-4 h-4" /> {t('createChallenge')}
            </Button>
          )}
        </div>
      </motion.div>

      {/* Winner info card */}
      <div className="bg-gradient-to-br from-accent/15 to-primary/5 rounded-2xl border border-accent/20 p-4 text-center">
        <p className="font-heading font-semibold text-lg">🏆 80% para el ganador</p>
        <p className="text-sm text-muted-foreground mt-1">{t('winnerGets')}</p>
      </div>

      <Tabs defaultValue="friends">
        <TabsList className="w-full">
          <TabsTrigger value="friends" className="flex-1">{t('myFriends')} {friends.length > 0 && `(${friends.length})`}</TabsTrigger>
          <TabsTrigger value="find" className="flex-1">{t('findFriends')}</TabsTrigger>
          <TabsTrigger value="challenges" className="flex-1">Desafíos {privateChallenges.length > 0 && `(${privateChallenges.length})`}</TabsTrigger>
        </TabsList>

        {/* My Friends */}
        <TabsContent value="friends" className="mt-4 space-y-3">
          {pending.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Solicitudes pendientes ({pending.length})</p>
              {pending.map(req => (
                <div key={req.id} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border">
                  <FriendAvatar email={req.requester_email} name={req.requester_name} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{req.requester_name || req.requester_email}</p>
                    <p className="text-xs text-muted-foreground">{req.requester_email}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => respond(req.id, 'accepted')} className="h-8 w-8 p-0">
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => respond(req.id, 'declined')} className="h-8 w-8 p-0">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {friends.length === 0 ? (
            <div className="text-center py-12 bg-card rounded-2xl border border-border">
              <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">{t('nofriends')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {friends.map(f => (
                <div key={f.friend_email} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border">
                  <FriendAvatar email={f.friend_email} name={f.friend_name} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{f.friend_name || f.friend_email}</p>
                    <p className="text-xs text-muted-foreground">{f.friend_email}</p>
                  </div>
                  <span className="text-xs text-primary font-medium bg-primary/10 px-2 py-0.5 rounded-full">Amigo ⛳</span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Find Friends */}
        <TabsContent value="find" className="mt-4 space-y-4">
          {/* Invite link + QR */}
          <InviteCard user={user} />

          <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
            <p className="text-sm text-muted-foreground">O añade a alguien por su correo electrónico</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder={t('searchByEmail')}
                  value={searchEmail}
                  onChange={e => setSearchEmail(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button onClick={sendInvite} disabled={!searchEmail || searching}>
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              </Button>
            </div>
            <AnimatePresence>
              {inviteSent && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex items-center gap-2 p-3 rounded-xl bg-primary/10 text-primary text-sm">
                  <Check className="w-4 h-4" /> {t('invited')}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {sentRequests.filter(r => r.status === 'pending').length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Invitaciones enviadas</p>
              {sentRequests.filter(r => r.status === 'pending').map(req => (
                <div key={req.id} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border">
                  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                    ?
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{req.receiver_email}</p>
                  </div>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{t('pending')}</span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Private Challenges */}
        <TabsContent value="challenges" className="mt-4 space-y-3">
          {friends.length > 0 && (
            <Button onClick={() => setShowCreate(true)} className="w-full gap-2">
              <Plus className="w-4 h-4" /> {t('createPrivateChallenge')}
            </Button>
          )}

          {privateChallenges.length === 0 ? (
            <div className="text-center py-12 bg-card rounded-2xl border border-border">
              <Trophy className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">Sin desafíos privados aún</p>
              {friends.length > 0 && (
                <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowCreate(true)}>
                  Crear uno ahora
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {privateChallenges.map(ch => (
                <div key={ch.id} className="bg-card rounded-2xl border border-border p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-heading font-semibold">{ch.title}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {ch.start_date && format(new Date(ch.start_date), 'd MMM')} – {ch.end_date && format(new Date(ch.end_date), 'd MMM yyyy')}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ch.status === 'open' ? 'bg-accent/10 text-accent' : 'bg-primary/10 text-primary'}`}>
                      {ch.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center p-2 rounded-xl bg-muted">
                      <p className="text-xs text-muted-foreground">Pool</p>
                      <p className="font-bold">${ch.total_pool || 0}</p>
                    </div>
                    <div className="text-center p-2 rounded-xl bg-muted">
                      <p className="text-xs text-muted-foreground">Entrada</p>
                      <p className="font-bold">${ch.entry_fee}</p>
                    </div>
                    <div className="text-center p-2 rounded-xl bg-muted">
                      <p className="text-xs text-muted-foreground">Ganador</p>
                      <p className="font-bold text-accent">80%</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {ch.participant_emails?.map(email => (
                      <span key={email} className="text-xs bg-muted rounded-full px-2 py-0.5">{email}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AnimatePresence>
        {showCreate && (
          <CreateChallengeModal
            friends={friends}
            myEmail={user?.email}
            onClose={() => setShowCreate(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}