import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

/**
 * Shows a friend's avatar (photo if available, else initials).
 * Looks up the user by email to get their avatar_url.
 */
export default function FriendAvatar({ email, name, size = 'md' }) {
  const sizes = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
  };

  const { data: users = [] } = useQuery({
    queryKey: ['user-avatar', email],
    queryFn: () => base44.entities.User.filter({ email }),
    enabled: !!email,
    staleTime: 5 * 60 * 1000,
  });

  const avatarUrl = users[0]?.avatar_url;
  const initial = name?.[0]?.toUpperCase() || email?.[0]?.toUpperCase() || '?';

  return (
    <div className={`rounded-full overflow-hidden shrink-0 bg-primary/10 flex items-center justify-center ${sizes[size]}`}>
      {avatarUrl ? (
        <img src={avatarUrl} alt={name || email} className="w-full h-full object-cover" />
      ) : (
        <span className="font-bold text-primary">{initial}</span>
      )}
    </div>
  );
}