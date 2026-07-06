package com.bedregen.data;

/**
 * Coordinates and world of a saved region. The min corner is the paste-back
 * anchor used to restore the schematic at the exact original location.
 */
public final class RegionData {

    private final String name;
    private final String world;
    private final int minX;
    private final int minY;
    private final int minZ;
    private final int maxX;
    private final int maxY;
    private final int maxZ;

    public RegionData(String name, String world,
                       int minX, int minY, int minZ,
                       int maxX, int maxY, int maxZ) {
        this.name = name;
        this.world = world;
        this.minX = minX;
        this.minY = minY;
        this.minZ = minZ;
        this.maxX = maxX;
        this.maxY = maxY;
        this.maxZ = maxZ;
    }

    public String getName() {
        return name;
    }

    public String getWorld() {
        return world;
    }

    public int getMinX() {
        return minX;
    }

    public int getMinY() {
        return minY;
    }

    public int getMinZ() {
        return minZ;
    }

    public int getMaxX() {
        return maxX;
    }

    public int getMaxY() {
        return maxY;
    }

    public int getMaxZ() {
        return maxZ;
    }

    public long sizeX() {
        return (long) maxX - minX + 1;
    }

    public long sizeY() {
        return (long) maxY - minY + 1;
    }

    public long sizeZ() {
        return (long) maxZ - minZ + 1;
    }
}
