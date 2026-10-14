from pydantic import BaseModel


class LocationNodeResponse(BaseModel):
    id: int
    name: str
    parent_id: int | None
    description: str | None
    path: str
    aliases: list[str]
    record_count: int
    total_units: int
    children: list["LocationNodeResponse"]


class UnresolvedLocationResponse(BaseModel):
    record_count: int
    total_units: int


class LocationListResponse(BaseModel):
    locations: list[LocationNodeResponse]
    unresolved: UnresolvedLocationResponse


class LocationDetailResponse(LocationNodeResponse):
    pass
