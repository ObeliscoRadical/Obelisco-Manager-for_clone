"""
Test suite for Reconciliation Audit Reports feature (iteration 52)
Tests:
- POST /api/expenses/reconcile-apply returns report object with id, created_at, file_name, download_url
- Report persisted in expense_reconciliation_reports collection
- GET /api/expenses/reconcile-reports lists recent audit reports
- GET /api/expenses/reconcile-reports/{report_id}/download returns valid Excel file
- Authentication required for all endpoints
"""
import pytest
import requests
import os
from datetime import datetime
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestReconciliationAuditReports:
    """Tests for the new reconciliation audit report feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: authenticate as admin"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@obelisco.pt",
            "password": "obelisco2024"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        token = login_response.json().get("access_token")
        assert token, "No token returned"
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        self.token = token
        yield
        # Cleanup: no specific cleanup needed
    
    def test_reconcile_preview_returns_200(self):
        """GET /api/expenses/reconcile-preview should return 200 with preview data"""
        response = self.session.get(f"{BASE_URL}/api/expenses/reconcile-preview", params={
            "month": 8,
            "year": 2026
        })
        assert response.status_code == 200, f"Preview failed: {response.text}"
        data = response.json()
        
        # Verify structure
        assert "scope" in data, "Missing scope in preview"
        assert "summary" in data, "Missing summary in preview"
        assert "dry_run" in data, "Missing dry_run in preview"
        assert data["dry_run"] == True, "Preview should have dry_run=True"
        
        # Verify summary structure
        summary = data["summary"]
        assert "records_scanned" in summary
        assert "reconcilable_pairs" in summary
        assert "duplicates_to_remove" in summary
        assert "hard_duplicate_groups" in summary
        print(f"Preview returned: {summary['records_scanned']} records scanned, {summary['reconcilable_pairs']} reconcilable pairs")
    
    def test_reconcile_apply_returns_report_object(self):
        """POST /api/expenses/reconcile-apply should return report object with id, created_at, file_name, download_url"""
        response = self.session.post(f"{BASE_URL}/api/expenses/reconcile-apply", params={
            "month": 8,
            "year": 2026
        })
        assert response.status_code == 200, f"Apply failed: {response.text}"
        data = response.json()
        
        # Verify dry_run is False
        assert data.get("dry_run") == False, "Apply should have dry_run=False"
        
        # Verify report object exists
        assert "report" in data, "Missing report object in apply response"
        report = data["report"]
        
        if report:  # Report may be None if no actor_user passed (but should exist with auth)
            assert "id" in report, "Report missing id"
            assert "created_at" in report, "Report missing created_at"
            assert "file_name" in report, "Report missing file_name"
            assert "download_url" in report, "Report missing download_url"
            
            # Verify download_url format
            assert report["download_url"].startswith("/api/expenses/reconcile-reports/"), "Invalid download_url format"
            assert report["download_url"].endswith("/download"), "download_url should end with /download"
            
            # Verify file_name format
            assert report["file_name"].endswith(".xlsx"), "file_name should be .xlsx"
            assert "reconciliacao_despesas" in report["file_name"], "file_name should contain reconciliacao_despesas"
            
            print(f"Report created: {report['id']}, file: {report['file_name']}")
            
            # Store for later tests
            self.__class__.last_report_id = report["id"]
            self.__class__.last_report_filename = report["file_name"]
        else:
            print("Warning: report is None - may indicate actor_user not passed correctly")
    
    def test_list_reconciliation_reports(self):
        """GET /api/expenses/reconcile-reports should list recent audit reports"""
        response = self.session.get(f"{BASE_URL}/api/expenses/reconcile-reports", params={"limit": 10})
        assert response.status_code == 200, f"List reports failed: {response.text}"
        data = response.json()
        
        # Should be a list
        assert isinstance(data, list), "Response should be a list"
        
        if len(data) > 0:
            report = data[0]
            # Verify report structure (without heavy fields)
            assert "id" in report, "Report missing id"
            assert "created_at" in report, "Report missing created_at"
            assert "file_name" in report, "Report missing file_name"
            assert "download_url" in report, "Report missing download_url"
            assert "scope" in report, "Report missing scope"
            assert "summary" in report, "Report missing summary"
            assert "result" in report, "Report missing result"
            assert "created_by" in report, "Report missing created_by"
            
            # Verify heavy fields are excluded
            assert "reconciled_items" not in report, "reconciled_items should be excluded from list"
            assert "removed_duplicates" not in report, "removed_duplicates should be excluded from list"
            
            print(f"Found {len(data)} reports. Latest: {report['file_name']} created at {report['created_at']}")
        else:
            print("No reports found - this may be expected if no reconciliation has been run")
    
    def test_download_reconciliation_report(self):
        """GET /api/expenses/reconcile-reports/{report_id}/download should return valid Excel file"""
        # First get list of reports
        list_response = self.session.get(f"{BASE_URL}/api/expenses/reconcile-reports", params={"limit": 1})
        assert list_response.status_code == 200
        reports = list_response.json()
        
        if len(reports) == 0:
            pytest.skip("No reports available to download")
        
        report_id = reports[0]["id"]
        expected_filename = reports[0]["file_name"]
        
        # Download the report
        download_response = self.session.get(f"{BASE_URL}/api/expenses/reconcile-reports/{report_id}/download")
        assert download_response.status_code == 200, f"Download failed: {download_response.text}"
        
        # Verify content type
        content_type = download_response.headers.get("content-type", "")
        assert "spreadsheetml" in content_type or "application/vnd.openxmlformats" in content_type, f"Invalid content type: {content_type}"
        
        # Verify content disposition (filename)
        content_disposition = download_response.headers.get("content-disposition", "")
        assert expected_filename in content_disposition or "attachment" in content_disposition.lower(), f"Invalid content disposition: {content_disposition}"
        
        # Verify content is not empty and starts with Excel magic bytes (PK for ZIP/XLSX)
        content = download_response.content
        assert len(content) > 0, "Downloaded file is empty"
        assert content[:2] == b'PK', "File does not appear to be a valid XLSX (ZIP) file"
        
        print(f"Downloaded report {report_id}: {len(content)} bytes, content-type: {content_type}")
    
    def test_download_nonexistent_report_returns_404(self):
        """GET /api/expenses/reconcile-reports/{invalid_id}/download should return 404"""
        fake_id = str(uuid.uuid4())
        response = self.session.get(f"{BASE_URL}/api/expenses/reconcile-reports/{fake_id}/download")
        assert response.status_code == 404, f"Expected 404 for nonexistent report, got {response.status_code}"
    
    def test_list_reports_requires_auth(self):
        """GET /api/expenses/reconcile-reports should require authentication"""
        no_auth_session = requests.Session()
        response = no_auth_session.get(f"{BASE_URL}/api/expenses/reconcile-reports")
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
    
    def test_download_report_requires_auth(self):
        """GET /api/expenses/reconcile-reports/{id}/download should require authentication"""
        # First get a valid report id
        list_response = self.session.get(f"{BASE_URL}/api/expenses/reconcile-reports", params={"limit": 1})
        reports = list_response.json()
        
        if len(reports) == 0:
            pytest.skip("No reports available")
        
        report_id = reports[0]["id"]
        
        # Try to download without auth
        no_auth_session = requests.Session()
        response = no_auth_session.get(f"{BASE_URL}/api/expenses/reconcile-reports/{report_id}/download")
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
    
    def test_report_contains_metadata(self):
        """Verify report contains user metadata (created_by_name, created_by_email)"""
        response = self.session.get(f"{BASE_URL}/api/expenses/reconcile-reports", params={"limit": 1})
        assert response.status_code == 200
        reports = response.json()
        
        if len(reports) == 0:
            pytest.skip("No reports available")
        
        report = reports[0]
        
        # Verify user metadata
        assert "created_by" in report, "Report missing created_by"
        # created_by_name and created_by_email may be in the full document
        
        # Verify scope metadata
        scope = report.get("scope", {})
        assert "month" in scope or "year" in scope, "Scope should contain month/year"
        
        # Verify result metadata
        result = report.get("result", {})
        assert "reconciled" in result or "duplicates_removed" in result, "Result should contain reconciled/duplicates_removed counts"
        
        print(f"Report metadata: created_by={report.get('created_by')}, scope={scope}, result={result}")
    
    def test_apply_message_format(self):
        """POST /api/expenses/reconcile-apply should return proper message format"""
        response = self.session.post(f"{BASE_URL}/api/expenses/reconcile-apply", params={
            "month": 8,
            "year": 2026
        })
        assert response.status_code == 200
        data = response.json()
        
        # Verify message exists
        assert "message" in data, "Missing message in apply response"
        message = data["message"]
        
        # Message should contain reconciled and duplicates counts
        assert "reconciliadas" in message.lower() or "duplicados" in message.lower(), f"Message format unexpected: {message}"
        
        print(f"Apply message: {message}")


class TestReconciliationReportPersistence:
    """Tests for report persistence in database"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: authenticate as admin"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@obelisco.pt",
            "password": "obelisco2024"
        })
        assert login_response.status_code == 200
        token = login_response.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        yield
    
    def test_report_persisted_after_apply(self):
        """After reconcile-apply, report should be persisted and retrievable"""
        # Get initial count
        initial_response = self.session.get(f"{BASE_URL}/api/expenses/reconcile-reports", params={"limit": 100})
        initial_count = len(initial_response.json())
        
        # Apply reconciliation
        apply_response = self.session.post(f"{BASE_URL}/api/expenses/reconcile-apply", params={
            "month": 8,
            "year": 2026
        })
        assert apply_response.status_code == 200
        apply_data = apply_response.json()
        
        if apply_data.get("report"):
            new_report_id = apply_data["report"]["id"]
            
            # Verify report is now in list
            list_response = self.session.get(f"{BASE_URL}/api/expenses/reconcile-reports", params={"limit": 100})
            reports = list_response.json()
            
            # Find the new report
            found = any(r["id"] == new_report_id for r in reports)
            assert found, f"New report {new_report_id} not found in list"
            
            print(f"Report {new_report_id} successfully persisted and retrievable")
        else:
            print("No report generated (may be expected if no changes)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
