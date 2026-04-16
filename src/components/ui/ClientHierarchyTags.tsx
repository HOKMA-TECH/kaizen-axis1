import { Directorate, Profile, Team } from '@/context/AppContext';

interface ClientHierarchyTagsProps {
  /** owner_id from client or user_id from appointment */
  ownerId?: string | null;
  allProfiles: Profile[];
  teams?: Team[];
  directorates?: Directorate[];
  resolved?: {
    ownerName?: string | null;
    coordinatorName?: string | null;
    teamName?: string | null;
    directorateName?: string | null;
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
  directorates,
  resolved,
  className,
}: ClientHierarchyTagsProps) {
  const ownerProfile = ownerId ? allProfiles.find(p => p.id === ownerId) : null;

  const resolvedTeamId = ownerProfile?.team_id || ownerProfile?.team || null;

  const resolvedTeam = (() => {
    if (!teams || !ownerProfile) return null;

    const directById = resolvedTeamId
      ? teams.find(t => t.id === resolvedTeamId) ?? null
      : null;

    const directByLegacy = ownerProfile.team
      ? teams.find(t => t.id === ownerProfile.team) ?? null
      : null;

    const byMembership = ownerId
      ? teams.find(t => Array.isArray(t.members) && t.members.includes(ownerId)) ?? null
      : null;

    // profile.team_id/team e a fonte principal para evitar tag antiga.
    return directById ?? directByLegacy ?? byMembership;
  })();

  const explicitCoordinator = ownerProfile?.coordinator_id
    ? allProfiles.find(p => p.id === ownerProfile.coordinator_id) ?? null
    : null;

  const fallbackCoordinator = !explicitCoordinator && resolvedTeam
    ? allProfiles.find((p) => {
      const role = String(p.role || '').toUpperCase();
      return role === 'COORDENADOR' && (p.team_id === resolvedTeam.id || p.team === resolvedTeam.id);
    }) ?? null
    : null;

  const coordProfile = explicitCoordinator ?? fallbackCoordinator;

  const teamName = resolvedTeam?.name ?? null;
  const resolvedDirectorateId = ownerProfile?.directorate_id || resolvedTeam?.directorate_id || null;
  const directorateName = resolvedDirectorateId
    ? directorates?.find(d => d.id === resolvedDirectorateId)?.name ?? null
    : null;

  const ownerName = ownerProfile?.name ?? resolved?.ownerName ?? null;
  const coordinatorName = coordProfile?.name ?? resolved?.coordinatorName ?? null;
  const finalTeamName = teamName ?? resolved?.teamName ?? null;
  const finalDirectorateName = directorateName ?? resolved?.directorateName ?? null;

  if (!ownerName && !coordinatorName && !finalTeamName && !finalDirectorateName) return null;

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
      {finalDirectorateName && (
        <span className="inline-flex items-center text-[10px] bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full font-medium">
          🏛️ {finalDirectorateName}
        </span>
      )}
    </div>
  );
}
