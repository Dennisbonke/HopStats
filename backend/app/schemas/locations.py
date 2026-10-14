from pydantic import BaseModel, ConfigDict


class LocationAliasResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    alias: str
    managed_by_config: bool


class LocationRuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    pattern: str
    match_kind: str
    priority: int
    managed_by_config: bool


class ReconciliationResponse(BaseModel):
    changed_records: int
    unresolved_records: int
    ambiguous_records: int


class LocationNodeResponse(BaseModel):
    id: int
    name: str
    parent_id: int | None
    description: str | None
    path: str
    aliases: list[str]
    alias_details: list[LocationAliasResponse]
    rules: list[LocationRuleResponse]
    managed_by_config: bool | None
    ownership: str
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


class LocationCreateRequest(BaseModel):
    name: str
    parent_id: int | None = None
    description: str | None = None


class LocationUpdateRequest(BaseModel):
    name: str | None = None
    parent_id: int | None = None
    description: str | None = None


class LocationOwnershipTransferRequest(BaseModel):
    confirm_configuration_removed: bool = False


class AliasCreateRequest(BaseModel):
    alias: str


class AliasUpdateRequest(BaseModel):
    alias: str


class LocationMutationResponse(LocationDetailResponse):
    reconciliation: ReconciliationResponse


class AliasMutationResponse(BaseModel):
    alias: LocationAliasResponse
    reconciliation: ReconciliationResponse
