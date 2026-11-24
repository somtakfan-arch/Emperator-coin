"""Role-based admin permissions.

Super admins (config.ADMIN_USER_IDS) have every permission and can grant
ranks. Everyone else gets a rank via /admin grant; each rank maps to a set of
permissions in config.ADMIN_RANKS.
"""
from . import config


def is_god(storage, user_id: int) -> bool:
    """👁‍🗨 ВЛАДЫКА — the top rank, above ULTRA. Granted/revoked explicitly
    (/god, /ungod); decoupled from super-admin so it can be removed from anyone.
    A god bypasses everything and holds every admin permission."""
    return storage.is_god(user_id)


def rank_of(storage, user_id: int):
    """The user's rank string: 'супер' for super admins, 'владыка' for gods,
    the stored rank for ranked admins, or None."""
    if user_id in config.ADMIN_USER_IDS:
        return "супер"
    if storage.is_god(user_id):
        return "владыка"
    return storage.get_admin_rank(user_id)


def perms_of(storage, user_id: int):
    # Gods (and supers) hold every permission.
    if user_id in config.ADMIN_USER_IDS or storage.is_god(user_id):
        return set(config.ADMIN_PERMS)
    rank = storage.get_admin_rank(user_id)
    return set(config.ADMIN_RANKS.get(rank, set())) if rank else set()


def is_super(user_id: int) -> bool:
    return user_id in config.ADMIN_USER_IDS


def is_admin(storage, user_id: int) -> bool:
    """Any admin at all — super, god, or ranked."""
    return (user_id in config.ADMIN_USER_IDS
            or storage.is_god(user_id)
            or storage.get_admin_rank(user_id) is not None)


def has_perm(storage, user_id: int, perm: str) -> bool:
    return perm in perms_of(storage, user_id)


def admin_ids_with(storage, perm: str):
    """User ids of every admin that holds a permission (super + ranked)."""
    ids = set(config.ADMIN_USER_IDS)
    for row in storage.list_admin_roles():
        if perm in config.ADMIN_RANKS.get(row["rank"], set()):
            ids.add(row["user_id"])
    return ids
