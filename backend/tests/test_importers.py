import csv
from io import BytesIO, StringIO

import pytest

from backend.app.importers.base import ImportValidationError, UnsupportedSchemaError
from backend.app.importers.registry import select_importer
from backend.app.importers.untappd_checkins_csv import UntappdCheckinsCsvImporter
from backend.app.importers.untappd_stash_csv import UntappdStashCsvImporter

CHECKIN_HEADER = (
    "beer_name,brewery_name,beer_type,beer_abv,beer_ibu,comment,venue_name,venue_city,venue_state,"
    "venue_country,venue_lat,venue_lng,venue_id,rating_score,created_at,timezone_offset,checkin_url,"
    "beer_url,brewery_url,brewery_country,brewery_city,brewery_state,flavor_profiles,purchase_venue,"
    "serving_type,checkin_id,bid,brewery_id,photo_url,global_rating_score,global_weighted_rating_score,"
    "tagged_friends,total_toasts,total_comments"
)


def test_checkin_parser_normalizes_timestamp_and_preserves_metadata():
    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=CHECKIN_HEADER.split(","))
    writer.writeheader()
    writer.writerow(
        {
            "beer_name": "Ål Saison",
            "brewery_name": "Brew Co",
            "beer_type": "Farmhouse Ale",
            "beer_abv": "6.5",
            "beer_ibu": "22",
            "comment": "line one\nline two",
            "rating_score": "4.25",
            "created_at": "2026-09-29T20:00:00-07:00",
            "timezone_offset": "-420",
            "serving_type": "Bottle",
            "checkin_id": "check-1",
            "bid": "beer-1",
            "brewery_id": "brew-1",
            "tagged_friends": "friends",
            "total_toasts": "2",
            "total_comments": "3",
        }
    )
    parsed = UntappdCheckinsCsvImporter().parse(BytesIO(output.getvalue().encode()))
    record = parsed.records[0]
    assert record.occurred_at_utc.isoformat() == "2026-09-30T03:00:00"
    assert record.original_offset_minutes == -420
    assert record.rating == 4.25
    assert record.comment == "line one\nline two"
    assert record.source_metadata["tagged_friends"] == "friends"


def test_stash_parser_handles_sentinels_and_suspicious_date():
    csv = (
        "item_id,beer_name,brewery_name,beer_type,beer_abv,beer_ibu,created_at,notes,quantity,container,"
        "purchase_date,bottled_date,best_by_date,best_by_date_iso,purchase_location,purchase_price,photo\n"
        "item-1,One Beer,Brewery,Lager,5.0,20,2026-10-06T12:00:00+00:00,cellar,2,Bottle,"
        "0000-00-00,0000-00-00 00:00:00,,2100-01-01,Shop,4.50,https://img\n"
    )
    record = UntappdStashCsvImporter().parse(BytesIO(csv.encode())).records[0]
    assert record.quantity == 2
    assert record.purchase_date is None
    assert record.bottled_date is None
    assert record.best_before.isoformat() == "2100-01-01"
    assert record.suspicious_best_before is True
    assert record.notes == "cellar"


@pytest.mark.parametrize("importer", [UntappdCheckinsCsvImporter(), UntappdStashCsvImporter()])
def test_missing_required_columns_are_rejected(importer):
    with pytest.raises(ImportValidationError, match="missing required columns"):
        importer.parse(BytesIO(b"name,other\nvalue,value\n"))


def test_duplicate_external_identifiers_are_rejected():
    csv = "item_id,beer_name,brewery_name,quantity\nsame,Beer,Brewery,1\nsame,Beer,Brewery,1\n"
    with pytest.raises(ImportValidationError, match="duplicate item_id"):
        UntappdStashCsvImporter().parse(BytesIO(csv.encode()))


def test_unknown_schema_is_rejected():
    with pytest.raises(UnsupportedSchemaError):
        select_importer(["item_id", "checkin_id", "beer_name", "brewery_name", "quantity"])


def test_invalid_quantity_is_rejected():
    csv = "item_id,beer_name,brewery_name,quantity\nitem,Beer,Brewery,1.5\n"
    with pytest.raises(ImportValidationError, match="nonnegative integer"):
        UntappdStashCsvImporter().parse(BytesIO(csv.encode()))


def test_empty_csv_is_rejected():
    with pytest.raises(ImportValidationError, match="empty"):
        UntappdStashCsvImporter().parse(BytesIO(b""))
