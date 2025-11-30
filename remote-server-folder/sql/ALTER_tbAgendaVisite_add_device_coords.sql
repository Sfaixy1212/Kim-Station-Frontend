IF COL_LENGTH('dbo.tbAgendaVisite', 'LatitudineDispositivo') IS NULL
BEGIN
    ALTER TABLE dbo.tbAgendaVisite
    ADD LatitudineDispositivo DECIMAL(10, 8) NULL;
END;
GO

IF COL_LENGTH('dbo.tbAgendaVisite', 'LongitudineDispositivo') IS NULL
BEGIN
    ALTER TABLE dbo.tbAgendaVisite
    ADD LongitudineDispositivo DECIMAL(11, 8) NULL;
END;
GO
