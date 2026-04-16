import { Profile, Team } from '@/context/AppContext';

interface ClientHierarchyTagsProps {
  /** owner_id from client or user_id from appointment */
  ownerId?: string | null;
  allProfiles: Profile[];
  teams?: Team[];
  resolved?: {
    ownerName?: string | null;
    coordinatorName?: string | null;
    teamName?: string | null;
  };
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
  resolved,
  className,
}: ClientHierarchyTagsProps) {
  const ownerProfile = ownerId ? allProfiles.find(p => p.id === ownerId) : null;

  const coordProfile = ownerProfile?.coordinator_id
    ? allProfiles.find(p => p.id === ownerProfile.coordinator_id) ?? null
    : null;

  const resolveTeamName = () => {
    if (!teams || !ownerProfile) return null;

    const directById = ownerProfile.team_id
      ? teams.find(t => t.id === ownerProfile.team_id) ?? null
      : null;

    const directByLegacy = ownerProfile.team
      ? teams.find(t => t.id === ownerProfile.team) ?? null
      : null;

    const byMembership = ownerId
      ? teams.find(t => Array.isArray(t.members) && t.members.includes(ownerId)) ?? null
      : null;

    // team_id/team no profile sao a fonte principal para evitar mostrar
    // equipe antiga caso o usuario ainda esteja em members legado.
    return directById?.name ?? directByLegacy?.name ?? byMembership?.name ?? null;
  };

  const teamName = resolveTeamName();

  const ownerName = ownerProfile?.name ?? resolved?.ownerName ?? null;
  const coordinatorName = coordProfile?.name ?? resolved?.coordinatorName ?? null;
  const finalTeamName = teamName ?? resolved?.teamName ?? null;

  if (!ownerName && !coordinatorName && !finalTeamName) return null;

  return (
    <div className={`flex flex-wrap gap-1 ${className ?? ''}`}>
      {ownerName && (
        <span className="inline-flex items-center text-[10px] bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full font-medium">
          👤 {ownerName}
        </span>
      )}
      {coordinatorName && (
        <span className="inline-flex items-center text-[10px] bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded-full font-medium">
          📋 {coordinatorName}
        </span>
      )}
      {finalTeamName && (
        <span className="inline-flex items-center text-[10px] bg-surface-100 dark:bg-surface-200 text-text-secondary px-2 py-0.5 rounded-full font-medium">
          🏢 {finalTeamName}
        </span>
      )}
    </div>
  );
}
