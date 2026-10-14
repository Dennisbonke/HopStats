from collections.abc import Sequence
from typing import BinaryIO, Protocol

from ..schemas.imports import ParsedImport


class ImporterError(ValueError):
    """Base class for errors caused by an input file."""


class UnsupportedSchemaError(ImporterError):
    pass


class ImportValidationError(ImporterError):
    def __init__(self, message: str, issues: Sequence[object] = ()):
        super().__init__(message)
        self.issues = tuple(issues)


class Importer(Protocol):
    kind: str

    def detect(self, headers: Sequence[str]) -> bool:
        """Return true only when the header signature is unambiguous."""

    def parse(self, stream: BinaryIO) -> ParsedImport:
        """Parse and validate a complete stream without database access."""
