from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ImportErrorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    row_number: int
    field: str | None
    reason: str


class ImportSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source_type: str
    filename: str
    sha256: str
    started_at: datetime
    completed_at: datetime | None
    status: str
    inserted_count: int
    updated_count: int
    unchanged_count: int
    removed_count: int
    rejected_count: int
    error_code: str | None
    error_summary: str | None
    errors: list[ImportErrorResponse] = Field(default_factory=list)


class ImportDetailResponse(ImportSummaryResponse):
    errors: list[ImportErrorResponse]
