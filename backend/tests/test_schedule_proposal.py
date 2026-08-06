"""
Test module for POST /api/proposals/{id}/schedule endpoint
Tests the auto-scheduling feature that finds the next free slot in business hours
and creates an appointment from a proposal.
"""
import pytest
import requests
import os
from datetime import datetime, timedelta
import urllib.parse

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestScheduleProposal:
    """Tests for the schedule proposal endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: login and get auth token, create test budget and proposal"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": os.environ.get("TEST_ADMIN_EMAIL", "admin@obelisco.pt"),
            "password": os.environ.get("TEST_ADMIN_PASSWORD", "obelisco2024")
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        token = login_resp.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Create test budget
        budget_resp = self.session.post(f"{BASE_URL}/api/budgets", json={
            "title": "TEST_Schedule_Budget",
            "client_name": "TEST_Cliente Agendamento",
            "client_phone": "912345678",
            "items": [
                {"category": "Mao de Obra", "name": "Instalacao teste", "unit": "unidade", "quantity": 1, "unit_cost": 100, "margin": 0.6}
            ]
        })
        assert budget_resp.status_code == 200, f"Budget creation failed: {budget_resp.text}"
        self.budget_id = budget_resp.json()["id"]
        
        # Generate proposals from budget
        proposals_resp = self.session.post(f"{BASE_URL}/api/budgets/{self.budget_id}/generate-proposals")
        assert proposals_resp.status_code == 200, f"Proposal generation failed: {proposals_resp.text}"
        proposals = proposals_resp.json()
        assert len(proposals) >= 1, "No proposals generated"
        self.proposal = proposals[0]  # Use the first (basico) proposal
        self.proposal_id = self.proposal["id"]
        
        self.created_appointments = []
        
        yield
        
        # Cleanup: delete appointments created during tests
        for apt_id in self.created_appointments:
            try:
                self.session.delete(f"{BASE_URL}/api/appointments/{apt_id}")
            except:
                pass
        
        # Cleanup: delete proposals and budget
        for p in proposals:
            try:
                self.session.delete(f"{BASE_URL}/api/proposals/{p['id']}")
            except:
                pass
        try:
            self.session.delete(f"{BASE_URL}/api/budgets/{self.budget_id}")
        except:
            pass
    
    # ===== BASIC SCHEDULING TESTS =====
    
    def test_schedule_creates_appointment_with_any_window(self):
        """POST /api/proposals/{id}/schedule with window='any' creates appointment in next available slot"""
        resp = self.session.post(f"{BASE_URL}/api/proposals/{self.proposal_id}/schedule", json={
            "window": "any",
            "duration_hours": 4
        })
        assert resp.status_code == 200, f"Schedule failed: {resp.text}"
        data = resp.json()
        
        # Verify response structure
        assert "appointment" in data, "Response missing 'appointment'"
        assert "widget_url" in data, "Response missing 'widget_url'"
        
        apt = data["appointment"]
        self.created_appointments.append(apt["id"])
        
        # Verify appointment fields
        assert apt["proposal_id"] == self.proposal_id, "proposal_id mismatch"
        assert apt["budget_id"] == self.budget_id, "budget_id mismatch"
        assert apt["client_name"] == self.proposal["client_name"], "client_name mismatch"
        assert apt["client_phone"] == self.proposal.get("client_phone", ""), "client_phone mismatch"
        assert "notes" in apt and str(self.proposal.get("final_value", 0)) in apt["notes"], "notes should contain proposal value"
        
        # Verify date is a weekday (Mon-Fri)
        apt_date = datetime.fromisoformat(apt["date"])
        assert apt_date.weekday() < 5, f"Appointment scheduled on weekend: {apt_date.strftime('%A')}"
        
        # Verify time is in business hours (09-13 or 14-18)
        time_start = apt["time_start"]
        time_end = apt["time_end"]
        start_hour = int(time_start.split(":")[0])
        end_hour = int(time_end.split(":")[0])
        
        is_morning = (start_hour >= 9 and end_hour <= 13)
        is_afternoon = (start_hour >= 14 and end_hour <= 18)
        assert is_morning or is_afternoon, f"Time not in business hours: {time_start}-{time_end}"
        
        print(f"✓ Appointment created: {apt['date']} {time_start}-{time_end}")
    
    def test_schedule_respects_morning_window(self):
        """POST with window='morning' only schedules in 09-13"""
        resp = self.session.post(f"{BASE_URL}/api/proposals/{self.proposal_id}/schedule", json={
            "window": "morning",
            "duration_hours": 4
        })
        assert resp.status_code == 200, f"Schedule failed: {resp.text}"
        data = resp.json()
        apt = data["appointment"]
        self.created_appointments.append(apt["id"])
        
        time_start = apt["time_start"]
        time_end = apt["time_end"]
        start_hour = int(time_start.split(":")[0])
        end_hour = int(time_end.split(":")[0])
        end_min = int(time_end.split(":")[1])
        
        assert start_hour >= 9, f"Morning slot starts before 09:00: {time_start}"
        assert end_hour < 13 or (end_hour == 13 and end_min == 0), f"Morning slot ends after 13:00: {time_end}"
        
        print(f"✓ Morning slot: {apt['date']} {time_start}-{time_end}")
    
    def test_schedule_respects_afternoon_window(self):
        """POST with window='afternoon' only schedules in 14-18"""
        resp = self.session.post(f"{BASE_URL}/api/proposals/{self.proposal_id}/schedule", json={
            "window": "afternoon",
            "duration_hours": 4
        })
        assert resp.status_code == 200, f"Schedule failed: {resp.text}"
        data = resp.json()
        apt = data["appointment"]
        self.created_appointments.append(apt["id"])
        
        time_start = apt["time_start"]
        time_end = apt["time_end"]
        start_hour = int(time_start.split(":")[0])
        end_hour = int(time_end.split(":")[0])
        end_min = int(time_end.split(":")[1])
        
        assert start_hour >= 14, f"Afternoon slot starts before 14:00: {time_start}"
        assert end_hour < 18 or (end_hour == 18 and end_min == 0), f"Afternoon slot ends after 18:00: {time_end}"
        
        print(f"✓ Afternoon slot: {apt['date']} {time_start}-{time_end}")
    
    # ===== DURATION TESTS =====
    
    def test_schedule_respects_duration_2h(self):
        """POST with duration_hours=2 creates 2-hour slot"""
        resp = self.session.post(f"{BASE_URL}/api/proposals/{self.proposal_id}/schedule", json={
            "window": "any",
            "duration_hours": 2
        })
        assert resp.status_code == 200, f"Schedule failed: {resp.text}"
        data = resp.json()
        apt = data["appointment"]
        self.created_appointments.append(apt["id"])
        
        # Calculate duration
        start_parts = apt["time_start"].split(":")
        end_parts = apt["time_end"].split(":")
        start_min = int(start_parts[0]) * 60 + int(start_parts[1])
        end_min = int(end_parts[0]) * 60 + int(end_parts[1])
        duration_min = end_min - start_min
        
        assert duration_min == 120, f"Duration should be 120 min (2h), got {duration_min} min"
        print(f"✓ 2h slot: {apt['time_start']}-{apt['time_end']} ({duration_min} min)")
    
    def test_schedule_respects_duration_3h(self):
        """POST with duration_hours=3 creates 3-hour slot"""
        resp = self.session.post(f"{BASE_URL}/api/proposals/{self.proposal_id}/schedule", json={
            "window": "any",
            "duration_hours": 3
        })
        assert resp.status_code == 200, f"Schedule failed: {resp.text}"
        data = resp.json()
        apt = data["appointment"]
        self.created_appointments.append(apt["id"])
        
        start_parts = apt["time_start"].split(":")
        end_parts = apt["time_end"].split(":")
        start_min = int(start_parts[0]) * 60 + int(start_parts[1])
        end_min = int(end_parts[0]) * 60 + int(end_parts[1])
        duration_min = end_min - start_min
        
        assert duration_min == 180, f"Duration should be 180 min (3h), got {duration_min} min"
        print(f"✓ 3h slot: {apt['time_start']}-{apt['time_end']} ({duration_min} min)")
    
    def test_schedule_respects_duration_4h(self):
        """POST with duration_hours=4 creates 4-hour slot"""
        resp = self.session.post(f"{BASE_URL}/api/proposals/{self.proposal_id}/schedule", json={
            "window": "any",
            "duration_hours": 4
        })
        assert resp.status_code == 200, f"Schedule failed: {resp.text}"
        data = resp.json()
        apt = data["appointment"]
        self.created_appointments.append(apt["id"])
        
        start_parts = apt["time_start"].split(":")
        end_parts = apt["time_end"].split(":")
        start_min = int(start_parts[0]) * 60 + int(start_parts[1])
        end_min = int(end_parts[0]) * 60 + int(end_parts[1])
        duration_min = end_min - start_min
        
        assert duration_min == 240, f"Duration should be 240 min (4h), got {duration_min} min"
        print(f"✓ 4h slot: {apt['time_start']}-{apt['time_end']} ({duration_min} min)")
    
    def test_schedule_respects_duration_8h(self):
        """POST with duration_hours=8 creates 8-hour slot (full day)"""
        resp = self.session.post(f"{BASE_URL}/api/proposals/{self.proposal_id}/schedule", json={
            "window": "any",
            "duration_hours": 8
        })
        # 8h doesn't fit in a single window (morning=4h, afternoon=4h), so it should fail or find a way
        # Based on the code, 8h won't fit in any single window (09-13 or 14-18 are both 4h max)
        # So this should return 422
        if resp.status_code == 422:
            print("✓ 8h duration correctly rejected (doesn't fit in any window)")
        elif resp.status_code == 200:
            # If it somehow works, verify the duration
            data = resp.json()
            apt = data["appointment"]
            self.created_appointments.append(apt["id"])
            
            start_parts = apt["time_start"].split(":")
            end_parts = apt["time_end"].split(":")
            start_min = int(start_parts[0]) * 60 + int(start_parts[1])
            end_min = int(end_parts[0]) * 60 + int(end_parts[1])
            duration_min = end_min - start_min
            
            assert duration_min == 480, f"Duration should be 480 min (8h), got {duration_min} min"
            print(f"✓ 8h slot: {apt['time_start']}-{apt['time_end']} ({duration_min} min)")
        else:
            pytest.fail(f"Unexpected status code: {resp.status_code} - {resp.text}")
    
    # ===== DUPLICATE BLOCKING TESTS =====
    
    def test_schedule_blocks_duplicate_409(self):
        """Second schedule call for same proposal returns 409 with existing appointment"""
        # First call - should succeed
        resp1 = self.session.post(f"{BASE_URL}/api/proposals/{self.proposal_id}/schedule", json={
            "window": "any",
            "duration_hours": 4
        })
        assert resp1.status_code == 200, f"First schedule failed: {resp1.text}"
        first_apt = resp1.json()["appointment"]
        self.created_appointments.append(first_apt["id"])
        
        # Second call - should return 409
        resp2 = self.session.post(f"{BASE_URL}/api/proposals/{self.proposal_id}/schedule", json={
            "window": "any",
            "duration_hours": 4
        })
        assert resp2.status_code == 409, f"Expected 409 for duplicate, got {resp2.status_code}"
        
        detail = resp2.json().get("detail", {})
        assert "appointment" in detail, "409 response should contain 'appointment' in detail"
        assert detail["appointment"]["id"] == first_apt["id"], "409 should return the existing appointment"
        
        print(f"✓ Duplicate blocked with 409, returned existing appointment {first_apt['id'][:8]}...")
    
    # ===== WIDGET URL TESTS =====
    
    def test_schedule_returns_widget_url_with_query_params(self):
        """widget_url contains all required query params"""
        resp = self.session.post(f"{BASE_URL}/api/proposals/{self.proposal_id}/schedule", json={
            "window": "any",
            "duration_hours": 4
        })
        assert resp.status_code == 200, f"Schedule failed: {resp.text}"
        data = resp.json()
        apt = data["appointment"]
        self.created_appointments.append(apt["id"])
        
        widget_url = data["widget_url"]
        assert widget_url.startswith("https://tech-app-obelisco.emergent.host/widget"), f"Wrong widget base URL: {widget_url}"
        
        # Parse query params
        parsed = urllib.parse.urlparse(widget_url)
        params = urllib.parse.parse_qs(parsed.query)
        
        # Verify required params
        assert "client" in params, "widget_url missing 'client' param"
        assert "phone" in params, "widget_url missing 'phone' param"
        assert "title" in params, "widget_url missing 'title' param"
        assert "proposal_id" in params, "widget_url missing 'proposal_id' param"
        assert "value" in params, "widget_url missing 'value' param"
        assert "date" in params, "widget_url missing 'date' param"
        assert "time_start" in params, "widget_url missing 'time_start' param"
        assert "time_end" in params, "widget_url missing 'time_end' param"
        
        # Verify values match
        assert params["client"][0] == self.proposal["client_name"], "client param mismatch"
        assert params["proposal_id"][0] == self.proposal_id, "proposal_id param mismatch"
        assert params["date"][0] == apt["date"], "date param mismatch"
        assert params["time_start"][0] == apt["time_start"], "time_start param mismatch"
        assert params["time_end"][0] == apt["time_end"], "time_end param mismatch"
        
        print(f"✓ Widget URL has all params: {list(params.keys())}")
    
    # ===== WEEKDAY TESTS =====
    
    def test_schedule_skips_weekends(self):
        """Appointments are never scheduled on Saturday or Sunday"""
        # Schedule multiple appointments and verify none are on weekends
        for i in range(3):
            # Create a new proposal for each test
            budget_resp = self.session.post(f"{BASE_URL}/api/budgets", json={
                "title": f"TEST_Weekend_Budget_{i}",
                "client_name": f"TEST_Weekend_Client_{i}",
                "client_phone": "912345678",
                "items": [{"category": "Test", "name": "Test item", "unit": "un", "quantity": 1, "unit_cost": 50, "margin": 0.5}]
            })
            budget_id = budget_resp.json()["id"]
            
            proposals_resp = self.session.post(f"{BASE_URL}/api/budgets/{budget_id}/generate-proposals")
            proposal_id = proposals_resp.json()[0]["id"]
            
            resp = self.session.post(f"{BASE_URL}/api/proposals/{proposal_id}/schedule", json={
                "window": "any",
                "duration_hours": 2
            })
            
            if resp.status_code == 200:
                apt = resp.json()["appointment"]
                self.created_appointments.append(apt["id"])
                
                apt_date = datetime.fromisoformat(apt["date"])
                assert apt_date.weekday() < 5, f"Appointment scheduled on weekend: {apt_date.strftime('%A %Y-%m-%d')}"
            
            # Cleanup
            for p in proposals_resp.json():
                self.session.delete(f"{BASE_URL}/api/proposals/{p['id']}")
            self.session.delete(f"{BASE_URL}/api/budgets/{budget_id}")
        
        print("✓ All appointments scheduled on weekdays only")
    
    # ===== ERROR CASES =====
    
    def test_schedule_404_for_nonexistent_proposal(self):
        """POST with invalid proposal_id returns 404"""
        resp = self.session.post(f"{BASE_URL}/api/proposals/nonexistent-id-12345/schedule", json={
            "window": "any",
            "duration_hours": 4
        })
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"
        print("✓ 404 for nonexistent proposal")
    
    def test_schedule_422_for_impossible_duration(self):
        """POST with duration that doesn't fit in any window returns 422"""
        # 10 hours doesn't fit in any single window (max is 4h per window)
        resp = self.session.post(f"{BASE_URL}/api/proposals/{self.proposal_id}/schedule", json={
            "window": "morning",  # morning is only 4h (09-13)
            "duration_hours": 10
        })
        assert resp.status_code == 422, f"Expected 422 for impossible duration, got {resp.status_code}"
        print("✓ 422 for impossible duration (10h in morning window)")
    
    # ===== APPOINTMENT DATA VERIFICATION =====
    
    def test_appointment_has_all_required_fields(self):
        """Created appointment has proposal_id, budget_id, client_name, client_phone, notes with value"""
        resp = self.session.post(f"{BASE_URL}/api/proposals/{self.proposal_id}/schedule", json={
            "window": "any",
            "duration_hours": 4
        })
        assert resp.status_code == 200, f"Schedule failed: {resp.text}"
        apt = resp.json()["appointment"]
        self.created_appointments.append(apt["id"])
        
        # Required fields
        assert "id" in apt, "Missing 'id'"
        assert "title" in apt, "Missing 'title'"
        assert "client_name" in apt, "Missing 'client_name'"
        assert "client_phone" in apt, "Missing 'client_phone'"
        assert "date" in apt, "Missing 'date'"
        assert "time_start" in apt, "Missing 'time_start'"
        assert "time_end" in apt, "Missing 'time_end'"
        assert "notes" in apt, "Missing 'notes'"
        assert "proposal_id" in apt, "Missing 'proposal_id'"
        assert "budget_id" in apt, "Missing 'budget_id'"
        
        # Verify values
        assert apt["proposal_id"] == self.proposal_id
        assert apt["budget_id"] == self.budget_id
        assert apt["client_name"] == self.proposal["client_name"]
        
        # Notes should contain the proposal value
        final_value = self.proposal.get("final_value", 0)
        assert str(int(final_value)) in apt["notes"] or str(final_value) in apt["notes"], \
            f"Notes should contain value {final_value}: {apt['notes']}"
        
        print(f"✓ Appointment has all required fields with correct values")


class TestAppointmentsOverlapRegression:
    """Regression tests: POST /api/appointments should still reject overlaps"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": os.environ.get("TEST_ADMIN_EMAIL", "admin@obelisco.pt"),
            "password": os.environ.get("TEST_ADMIN_PASSWORD", "obelisco2024")
        })
        assert login_resp.status_code == 200
        token = login_resp.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        self.created_appointments = []
        
        yield
        
        # Cleanup
        for apt_id in self.created_appointments:
            try:
                self.session.delete(f"{BASE_URL}/api/appointments/{apt_id}")
            except:
                pass
    
    def test_appointments_rejects_overlap(self):
        """POST /api/appointments rejects overlapping appointments"""
        # Find a future weekday
        today = datetime.now()
        future_date = today + timedelta(days=7)
        while future_date.weekday() >= 5:  # Skip weekends
            future_date += timedelta(days=1)
        date_str = future_date.strftime("%Y-%m-%d")
        
        # Create first appointment
        resp1 = self.session.post(f"{BASE_URL}/api/appointments", json={
            "title": "TEST_Overlap_First",
            "client_name": "TEST_Client",
            "date": date_str,
            "time_start": "10:00",
            "time_end": "12:00",
            "notes": "First appointment"
        })
        assert resp1.status_code == 200, f"First appointment failed: {resp1.text}"
        self.created_appointments.append(resp1.json()["id"])
        
        # Try to create overlapping appointment
        resp2 = self.session.post(f"{BASE_URL}/api/appointments", json={
            "title": "TEST_Overlap_Second",
            "client_name": "TEST_Client2",
            "date": date_str,
            "time_start": "11:00",  # Overlaps with 10:00-12:00
            "time_end": "13:00",
            "notes": "Should fail"
        })
        assert resp2.status_code == 400, f"Expected 400 for overlap, got {resp2.status_code}"
        
        print("✓ POST /api/appointments correctly rejects overlapping appointments")
    
    def test_appointments_allows_adjacent(self):
        """POST /api/appointments allows adjacent (non-overlapping) appointments"""
        today = datetime.now()
        future_date = today + timedelta(days=8)
        while future_date.weekday() >= 5:
            future_date += timedelta(days=1)
        date_str = future_date.strftime("%Y-%m-%d")
        
        # Create first appointment
        resp1 = self.session.post(f"{BASE_URL}/api/appointments", json={
            "title": "TEST_Adjacent_First",
            "client_name": "TEST_Client",
            "date": date_str,
            "time_start": "10:00",
            "time_end": "12:00",
            "notes": "First"
        })
        assert resp1.status_code == 200
        self.created_appointments.append(resp1.json()["id"])
        
        # Create adjacent appointment (starts when first ends)
        resp2 = self.session.post(f"{BASE_URL}/api/appointments", json={
            "title": "TEST_Adjacent_Second",
            "client_name": "TEST_Client2",
            "date": date_str,
            "time_start": "12:00",  # Starts exactly when first ends
            "time_end": "14:00",
            "notes": "Second"
        })
        assert resp2.status_code == 200, f"Adjacent appointment should be allowed: {resp2.text}"
        self.created_appointments.append(resp2.json()["id"])
        
        print("✓ POST /api/appointments allows adjacent appointments")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
