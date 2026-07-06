package com.bedregen.schematic;

import com.bedregen.BedRegenPlugin;
import com.bedregen.data.RegionData;
import com.sk89q.worldedit.EditSession;
import com.sk89q.worldedit.WorldEdit;
import com.sk89q.worldedit.WorldEditException;
import com.sk89q.worldedit.bukkit.BukkitAdapter;
import com.sk89q.worldedit.extent.clipboard.BlockArrayClipboard;
import com.sk89q.worldedit.extent.clipboard.Clipboard;
import com.sk89q.worldedit.extent.clipboard.io.BuiltInClipboardFormat;
import com.sk89q.worldedit.extent.clipboard.io.ClipboardFormat;
import com.sk89q.worldedit.extent.clipboard.io.ClipboardFormats;
import com.sk89q.worldedit.extent.clipboard.io.ClipboardReader;
import com.sk89q.worldedit.extent.clipboard.io.ClipboardWriter;
import com.sk89q.worldedit.function.operation.ForwardExtentCopy;
import com.sk89q.worldedit.function.operation.Operation;
import com.sk89q.worldedit.function.operation.Operations;
import com.sk89q.worldedit.math.BlockVector3;
import com.sk89q.worldedit.regions.CuboidRegion;
import com.sk89q.worldedit.session.ClipboardHolder;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;

/**
 * Uses the FAWE/WorldEdit clipboard API to copy a cuboid region into a
 * .schem file and to paste it back at its original coordinates.
 */
public final class SchematicService {

    private final File schematicsFolder;

    public SchematicService(BedRegenPlugin plugin) {
        this.schematicsFolder = new File(plugin.getDataFolder(), "schematics");
        if (!schematicsFolder.exists()) {
            schematicsFolder.mkdirs();
        }
    }

    public File schematicFile(String name) {
        return new File(schematicsFolder, name + ".schem");
    }

    public boolean deleteSchematic(String name) {
        File file = schematicFile(name);
        return !file.exists() || file.delete();
    }

    /**
     * Copies the cuboid between min and max (inclusive) and writes it to disk.
     * Runs the FAWE copy synchronously on the calling thread; callers that
     * want this off the main thread should invoke it from an async task.
     */
    public void saveRegion(org.bukkit.World bukkitWorld, BlockVector3 min, BlockVector3 max, String name) throws IOException {
        com.sk89q.worldedit.world.World weWorld = BukkitAdapter.adapt(bukkitWorld);
        CuboidRegion region = new CuboidRegion(weWorld, min, max);
        BlockArrayClipboard clipboard = new BlockArrayClipboard(region);
        clipboard.setOrigin(min);

        try (EditSession editSession = WorldEdit.getInstance().newEditSessionBuilder().world(weWorld).build()) {
            ForwardExtentCopy copy = new ForwardExtentCopy(editSession, region, clipboard, region.getMinimumPoint());
            copy.setCopyingEntities(true);
            Operations.complete(copy);
        } catch (WorldEditException e) {
            throw new IOException(e.getMessage(), e);
        }

        File file = schematicFile(name);
        ClipboardFormat format = BuiltInClipboardFormat.SPONGE_SCHEMATIC;
        try (FileOutputStream out = new FileOutputStream(file);
             ClipboardWriter writer = format.getWriter(out)) {
            writer.write(clipboard);
        }
    }

    /**
     * Reads the region's schematic and pastes it back at its saved minimum
     * corner, so the world ends up exactly as it was when saved.
     */
    public void pasteRegion(org.bukkit.World bukkitWorld, RegionData data) throws IOException {
        File file = schematicFile(data.getName());
        if (!file.exists()) {
            throw new IOException("Schematic file not found: " + file.getName());
        }

        ClipboardFormat format = ClipboardFormats.findByFile(file);
        if (format == null) {
            throw new IOException("Unknown schematic format: " + file.getName());
        }

        Clipboard clipboard;
        try (FileInputStream in = new FileInputStream(file);
             ClipboardReader reader = format.getReader(in)) {
            clipboard = reader.read();
        }

        com.sk89q.worldedit.world.World weWorld = BukkitAdapter.adapt(bukkitWorld);
        BlockVector3 min = BlockVector3.at(data.getMinX(), data.getMinY(), data.getMinZ());

        try (EditSession editSession = WorldEdit.getInstance().newEditSessionBuilder()
                .world(weWorld)
                .fastMode(true)
                .build()) {
            Operation operation = new ClipboardHolder(clipboard)
                    .createPaste(editSession)
                    .to(min)
                    .ignoreAirBlocks(false)
                    .build();
            Operations.complete(operation);
        } catch (WorldEditException e) {
            throw new IOException(e.getMessage(), e);
        }
    }
}
