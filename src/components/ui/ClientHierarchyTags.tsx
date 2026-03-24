import { Profile, Team } from '@/context/AppContext';

interface ClientHierarchyTagsProps {
  /** owner_id from client or user_id from appointment */
  ownerId?: string | null;
  allProfiles: Profile[];
  teams?: Team[];
  className?: string;
}

/**
 * Displays hierarchy tags (corretor, coordenador, equipe) for a client or appointment.
 * Only renders when there is at least one resolvable tag.
 */
export function ClientHierarchyTags({
  ownerId,
  allProfiles,
  teams,
  className,
}: ClientHierarchyTagsProps) {
  if (!ownerId) return null;

  const ownerProfile = allProfiles.find(p => p.id === ownerId);
  if (!ownerProfile) return null;

  const coordProfile = ownerProfile.coordinator_id
    ? allProfiles.find(p => p.id === ownerProfile.coordinator_id) ?? null
    : null;

  const teamName = teams
    ? (teams.find(t => t.id === ownerProfile.team_id)?.name ?? ownerProfile.team ?? null)
    : (ownerProfile.team ?? null);

  return (
    <div className={`flex flex-wrap gap-1 ${className ?? ''}`}>
      <span className="inline-flex items-center text-[10px] bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full font-medium">
        👤 {ownerProfile.name}
      </span>
      {coordProfile && (
        <span className="inline-flex items-center text-[10px] bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded-full font-medium">
          📋 {coordProfile.name}
        </span>
      )}
      {teamName && (
        <span className="inline-flex items-center text-[10px] bg-surface-100 dark:bg-surface-200 text-text-secondary px-2 py-0.5 rounded-full font-medium">
          🏢 {teamName}
        </span>
      )}
    </div>
  );
}
