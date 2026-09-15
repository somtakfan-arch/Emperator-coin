"""Role-based admin permissions.

Super admins (config.ADMIN_USER_IDS) have every permission and can grant
ranks. Everyone else gets a rank via /admin grant; each rank maps to a set of
permissions in config.ADMIN_RANKS.
"""
from . import config


def rank_of(storage, user_id: int):
    """The user's rank string: 'супер' for super admins, the stored rank for
    ranked admins, or None."""
    if user_id in config.ADMIN_USER_IDS:
        return "супер"
    return storage.get_admin_rank(user_id)


def perms_of(storage, user_id: int):
    if user_id in config.ADMIN_USER_IDS:
        return set(config.ADMIN_PERMS)
    rank = storage.get_admin_rank(user_id)
    return set(config.ADMIN_RANKS.get(rank, set())) if rank else set()


def is_super(user_id: int) -> bool:
    return user_id in config.ADMIN_USER_IDS


def is_admin(storage, user_id: int) -> bool:
    """Any admin at all — super or ranked."""
    return user_id in config.ADMIN_USER_IDS or storage.get_admin_rank(user_id) is not None


def has_perm(storage, user_id: int, perm: str) -> bool:
    return perm in perms_of(storage, user_id)


def admin_ids_with(storage, perm: str):
    """User ids of every admin that holds a permission (super + ranked)."""
    ids = set(config.ADMIN_USER_IDS)
    for row in storage.list_admin_roles():
        if perm in config.ADMIN_RANKS.get(row["rank"], set()):
            ids.add(row["user_id"])
    return ids
