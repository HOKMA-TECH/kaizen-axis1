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
  const isUuid = (value?: string | null) =>
    !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  const sanitizeLabel = (value?: string | null) => {
    const normalized = String(value || '').trim();
    if (!normalized) return null;
    if (normalized === '-' || normalized === '—') return null;
    if (normalized.toLowerCase() === 'n/a') return null;
    return normalized;
  };

  const rawTeamRef = ownerProfile?.team_id || ownerProfile?.team || null;

  const resolvedTeam = (() => {
    if (!teams || !ownerProfile) return null;

    const directById = rawTeamRef && isUuid(rawTeamRef)
      ? teams.find(t => t.id === rawTeamRef) ?? null
      : null;

    const byMembership = ownerId
      ? teams.find(t => Array.isArray(t.members) && t.members.includes(ownerId)) ?? null
      : null;

    const legacyNameSource = rawTeamRef && !isUuid(rawTeamRef)
      ? rawTeamRef
      : (ownerProfile.team && !isUuid(ownerProfile.team) ? ownerProfile.team : null);

    const byLegacyName = legacyNameSource
      ? teams.find(t => t.name.trim().toLowerCase() === legacyNameSource.trim().toLowerCase()) ?? null
      : null;

    const byManagerAndDirectorate = (() => {
      const managerId = ownerProfile.manager_id || null;
      const directorateId = ownerProfile.directorate_id || null;
      if (!managerId && !directorateId) return null;

      const candidates = teams.filter((t) => {
        const managerMatches = managerId ? t.manager_id === managerId : true;
        const directorateMatches = directorateId ? t.directorate_id === directorateId : true;
        return managerMatches && directorateMatches;
      });

      return candidates.length === 1 ? candidates[0] : null;
    })();

    // Prioridade: FK oficial -> membership -> legado por nome -> inferencia unica por gestor/diretoria.
    return directById ?? byMembership ?? byLegacyName ?? byManagerAndDirectorate;
  })();

  const explicitCoordinator = ownerProfile?.coordinator_id
    ? allProfiles.find(p => p.id === ownerProfile.coordinator_id) ?? null
    : null;

  const fallbackCoordinator = !explicitCoordinator && resolvedTeam
    ? allProfiles.find((p) => {
      const role = String(p.role || '').toUpperCase();
      const profileTeamRef = p.team_id || p.team || null;
      if (!profileTeamRef) return false;

      const sameTeamById = profileTeamRef === resolvedTeam.id;
      const sameTeamByName = profileTeamRef.trim().toLowerCase() === resolvedTeam.name.trim().toLowerCase();

      return role === 'COORDENADOR' && (sameTeamById || sameTeamByName);
    }) ?? null
    : null;

  const coordProfile = explicitCoordinator ?? fallbackCoordinator;

  const teamName = sanitizeLabel(resolvedTeam?.name ?? null);
  const resolvedDirectorateId = resolvedTeam?.directorate_id || ownerProfile?.directorate_id || null;
  const directorateName = resolvedDirectorateId
    ? directorates?.find(d => d.id === resolvedDirectorateId)?.name ?? null
    : null;

  const ownerName = sanitizeLabel(ownerProfile?.name ?? resolved?.ownerName ?? null);
  const coordinatorName = sanitizeLabel(coordProfile?.name ?? resolved?.coordinatorName ?? null);
  const finalTeamName = teamName ?? sanitizeLabel(resolved?.teamName ?? null);
  const finalDirectorateName = sanitizeLabel(directorateName ?? resolved?.directorateName ?? null);

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
