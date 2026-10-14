from collections.abc import Sequence

from .base import Importer, UnsupportedSchemaError
from .untappd_checkins_csv import UntappdCheckinsCsvImporter
from .untappd_stash_csv import UntappdStashCsvImporter

IMPORTERS: tuple[Importer, ...] = (UntappdCheckinsCsvImporter(), UntappdStashCsvImporter())


def select_importer(headers: Sequence[str]) -> Importer:
    matches = [importer for importer in IMPORTERS if importer.detect(headers)]
    if len(matches) != 1:
        raise UnsupportedSchemaError("CSV headers do not identify exactly one supported schema")
    return matches[0]
