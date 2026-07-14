-- Room-level conversation archive board tables (SQL Server)
-- Run this manually once.

IF OBJECT_ID(N'[RoomArchiveBoard]', N'U') IS NULL
BEGIN
  CREATE TABLE [RoomArchiveBoard] (
    [roomId] INT NOT NULL PRIMARY KEY,
    [isEnabled] BIT NOT NULL CONSTRAINT [DF_RoomArchiveBoard_isEnabled] DEFAULT (1),
    [isPinned] BIT NOT NULL CONSTRAINT [DF_RoomArchiveBoard_isPinned] DEFAULT (0),
    [pinnedItemId] INT NULL,
    [rotateIntervalSec] INT NOT NULL CONSTRAINT [DF_RoomArchiveBoard_rotateIntervalSec] DEFAULT (12),
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_RoomArchiveBoard_updatedAt] DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT [FK_RoomArchiveBoard_Room_roomId] FOREIGN KEY ([roomId]) REFERENCES [Room]([id]) ON DELETE CASCADE
  );
END;
GO

IF OBJECT_ID(N'[RoomArchiveItem]', N'U') IS NULL
BEGIN
  CREATE TABLE [RoomArchiveItem] (
    [id] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    [roomId] INT NOT NULL,
    [content] NVARCHAR(MAX) NOT NULL,
    [messageId] INT NULL,
    [sourceSenderId] INT NULL,
    [createdById] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [DF_RoomArchiveItem_createdAt] DEFAULT (SYSUTCDATETIME()),
    [isActive] BIT NOT NULL CONSTRAINT [DF_RoomArchiveItem_isActive] DEFAULT (1),
    CONSTRAINT [FK_RoomArchiveItem_Room_roomId] FOREIGN KEY ([roomId]) REFERENCES [Room]([id]) ON DELETE CASCADE,
    CONSTRAINT [FK_RoomArchiveItem_Message_messageId] FOREIGN KEY ([messageId]) REFERENCES [Message]([id]) ON DELETE SET NULL,
    CONSTRAINT [FK_RoomArchiveItem_User_sourceSenderId] FOREIGN KEY ([sourceSenderId]) REFERENCES [User]([id]) ON DELETE NO ACTION,
    CONSTRAINT [FK_RoomArchiveItem_User_createdById] FOREIGN KEY ([createdById]) REFERENCES [User]([id]) ON DELETE NO ACTION
  );
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_RoomArchiveItem_roomId_isActive_createdAt'
    AND object_id = OBJECT_ID(N'[RoomArchiveItem]')
)
BEGIN
  CREATE INDEX [IX_RoomArchiveItem_roomId_isActive_createdAt]
  ON [RoomArchiveItem]([roomId], [isActive], [createdAt] DESC);
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_RoomArchiveBoard_pinnedItemId'
    AND object_id = OBJECT_ID(N'[RoomArchiveBoard]')
)
BEGIN
  CREATE INDEX [IX_RoomArchiveBoard_pinnedItemId]
  ON [RoomArchiveBoard]([pinnedItemId]);
END;
GO
