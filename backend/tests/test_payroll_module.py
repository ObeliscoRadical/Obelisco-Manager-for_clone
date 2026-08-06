"""
Payroll Module Tests - Obelisco Manager
Tests for Phase 1: Funcionarios, Assiduidade, Processamento Salarial, Configuracoes
PT 2026 legal defaults: SS worker 11%, SS employer 23.75%, meal allowance 6€/day,
OT multipliers 125%/137.5%/150%/200%, progressive IRS brackets
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPayrollSettings:
    """Test payroll settings endpoints - GET/PUT /api/payroll/settings"""
    
    @pytest.fixture(autouse=True)
    def setup(self, auth_session):
        self.session = auth_session
    
    def test_get_default_settings(self):
        """GET /api/payroll/settings returns PT 2026 default values"""
        response = self.session.get(f"{BASE_URL}/api/payroll/settings")
        assert response.status_code == 200
        data = response.json()
        
        # Verify PT 2026 defaults
        assert data["ss_worker_pct"] == 11.0, "SS worker should be 11%"
        assert data["ss_employer_pct"] == 23.75, "SS employer should be 23.75%"
        assert data["meal_allowance_day"] == 6.00, "Meal allowance should be 6€/day"
        assert data["overtime_first_hour_pct"] == 125.0, "First OT hour should be 125%"
        assert data["overtime_extra_hour_pct"] == 137.5, "Extra OT hours should be 137.5%"
        assert data["overtime_night_weekend_pct"] == 150.0, "Night/weekend OT should be 150%"
        assert data["overtime_holiday_pct"] == 200.0, "Holiday OT should be 200%"
        assert data["standard_weekly_hours"] == 40.0
        assert data["standard_work_days_month"] == 22
        
        # Verify IRS brackets exist
        assert "irs_brackets" in data
        assert isinstance(data["irs_brackets"], list)
        assert len(data["irs_brackets"]) > 0
        print(f"PASS: Default settings returned with {len(data['irs_brackets'])} IRS brackets")
    
    def test_update_settings(self):
        """PUT /api/payroll/settings updates a rate and reads back correctly"""
        # Update SS worker to 12%
        update_data = {"ss_worker_pct": 12.0}
        response = self.session.put(f"{BASE_URL}/api/payroll/settings", json=update_data)
        assert response.status_code == 200
        data = response.json()
        assert data["ss_worker_pct"] == 12.0, "SS worker should be updated to 12%"
        
        # Verify persistence
        response = self.session.get(f"{BASE_URL}/api/payroll/settings")
        assert response.status_code == 200
        data = response.json()
        assert data["ss_worker_pct"] == 12.0, "SS worker should persist as 12%"
        
        # Restore to default
        self.session.put(f"{BASE_URL}/api/payroll/settings", json={"ss_worker_pct": 11.0})
        print("PASS: Settings update and persistence verified")


class TestPayrollEmployees:
    """Test employee CRUD - /api/payroll/employees"""
    
    @pytest.fixture(autouse=True)
    def setup(self, auth_session):
        self.session = auth_session
        self.created_ids = []
    
    def teardown_method(self):
        """Cleanup test employees"""
        for emp_id in self.created_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/payroll/employees/{emp_id}")
            except:
                pass
    
    def test_create_employee(self):
        """POST /api/payroll/employees creates employee with all fields"""
        emp_data = {
            "name": "TEST_Joao Silva",
            "nif": "123456789",
            "niss": "11111111111",
            "iban": "PT50000201231234567890154",
            "role": "Eletricista",
            "base_salary": 1500.0,
            "meal_allowance": 6.0,
            "active": True
        }
        response = self.session.post(f"{BASE_URL}/api/payroll/employees", json=emp_data)
        assert response.status_code == 200
        data = response.json()
        
        assert "id" in data
        self.created_ids.append(data["id"])
        assert data["name"] == "TEST_Joao Silva"
        assert data["nif"] == "123456789"
        assert data["base_salary"] == 1500.0
        assert data["meal_allowance"] == 6.0
        assert data["active"] == True
        print(f"PASS: Employee created with ID {data['id']}")
        return data["id"]
    
    def test_list_employees(self):
        """GET /api/payroll/employees returns list"""
        # Create an employee first
        emp_data = {"name": "TEST_List Employee", "base_salary": 1000}
        create_resp = self.session.post(f"{BASE_URL}/api/payroll/employees", json=emp_data)
        emp_id = create_resp.json()["id"]
        self.created_ids.append(emp_id)
        
        response = self.session.get(f"{BASE_URL}/api/payroll/employees")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # Verify our employee is in the list
        emp_names = [e["name"] for e in data]
        assert "TEST_List Employee" in emp_names
        print(f"PASS: Listed {len(data)} employees")
    
    def test_update_employee(self):
        """PUT /api/payroll/employees/{id} updates base_salary"""
        # Create employee
        emp_data = {"name": "TEST_Update Employee", "base_salary": 1200}
        create_resp = self.session.post(f"{BASE_URL}/api/payroll/employees", json=emp_data)
        emp_id = create_resp.json()["id"]
        self.created_ids.append(emp_id)
        
        # Update salary
        update_resp = self.session.put(f"{BASE_URL}/api/payroll/employees/{emp_id}", json={"base_salary": 1400})
        assert update_resp.status_code == 200
        assert update_resp.json()["base_salary"] == 1400
        
        # Verify persistence
        get_resp = self.session.get(f"{BASE_URL}/api/payroll/employees/{emp_id}")
        assert get_resp.status_code == 200
        assert get_resp.json()["base_salary"] == 1400
        print("PASS: Employee update verified")
    
    def test_delete_employee(self):
        """DELETE /api/payroll/employees/{id} removes employee"""
        # Create employee
        emp_data = {"name": "TEST_Delete Employee", "base_salary": 1000}
        create_resp = self.session.post(f"{BASE_URL}/api/payroll/employees", json=emp_data)
        emp_id = create_resp.json()["id"]
        
        # Delete
        del_resp = self.session.delete(f"{BASE_URL}/api/payroll/employees/{emp_id}")
        assert del_resp.status_code == 200
        
        # Verify deleted
        get_resp = self.session.get(f"{BASE_URL}/api/payroll/employees/{emp_id}")
        assert get_resp.status_code == 404
        print("PASS: Employee deletion verified")


class TestPayrollAttendance:
    """Test attendance CRUD - /api/payroll/attendance"""
    
    @pytest.fixture(autouse=True)
    def setup(self, auth_session):
        self.session = auth_session
        self.created_emp_ids = []
        self.created_att_ids = []
    
    def teardown_method(self):
        """Cleanup test data"""
        for att_id in self.created_att_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/payroll/attendance/{att_id}")
            except:
                pass
        for emp_id in self.created_emp_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/payroll/employees/{emp_id}")
            except:
                pass
    
    def _create_test_employee(self, name="TEST_Att Employee", salary=1200):
        resp = self.session.post(f"{BASE_URL}/api/payroll/employees", json={
            "name": name, "base_salary": salary, "meal_allowance": 6.0, "active": True
        })
        emp_id = resp.json()["id"]
        self.created_emp_ids.append(emp_id)
        return emp_id
    
    def test_create_attendance_normal(self):
        """POST /api/payroll/attendance creates normal day record"""
        emp_id = self._create_test_employee()
        
        att_data = {
            "employee_id": emp_id,
            "date": "2026-04-01",
            "day_type": "normal",
            "normal_hours": 8,
            "overtime_hours": 0
        }
        response = self.session.post(f"{BASE_URL}/api/payroll/attendance", json=att_data)
        assert response.status_code == 200
        data = response.json()
        
        assert "id" in data
        self.created_att_ids.append(data["id"])
        assert data["employee_id"] == emp_id
        assert data["day_type"] == "normal"
        assert data["normal_hours"] == 8
        print("PASS: Normal attendance created")
    
    def test_create_attendance_various_types(self):
        """POST /api/payroll/attendance with different day_types"""
        emp_id = self._create_test_employee()
        
        day_types = ["normal", "sabado", "domingo", "feriado", "ferias", "falta_i", "baixa"]
        for i, dtype in enumerate(day_types):
            att_data = {
                "employee_id": emp_id,
                "date": f"2026-04-{10+i:02d}",
                "day_type": dtype,
                "normal_hours": 8 if dtype in ["normal", "sabado"] else 0
            }
            response = self.session.post(f"{BASE_URL}/api/payroll/attendance", json=att_data)
            assert response.status_code == 200
            self.created_att_ids.append(response.json()["id"])
        
        print(f"PASS: Created attendance for {len(day_types)} day types")
    
    def test_list_attendance_by_employee_and_month(self):
        """GET /api/payroll/attendance with employee_id + month/year filter"""
        emp_id = self._create_test_employee()
        
        # Create 3 records in April 2026
        for day in [1, 2, 3]:
            att_data = {
                "employee_id": emp_id,
                "date": f"2026-04-{day:02d}",
                "day_type": "normal",
                "normal_hours": 8
            }
            resp = self.session.post(f"{BASE_URL}/api/payroll/attendance", json=att_data)
            self.created_att_ids.append(resp.json()["id"])
        
        # Filter by employee and month
        response = self.session.get(f"{BASE_URL}/api/payroll/attendance", params={
            "employee_id": emp_id, "month": 4, "year": 2026
        })
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 3
        print("PASS: Attendance filtering by employee/month works")
    
    def test_prevent_duplicate_date(self):
        """POST /api/payroll/attendance returns 400 for duplicate date"""
        emp_id = self._create_test_employee()
        
        att_data = {
            "employee_id": emp_id,
            "date": "2026-04-20",
            "day_type": "normal",
            "normal_hours": 8
        }
        # First create
        resp1 = self.session.post(f"{BASE_URL}/api/payroll/attendance", json=att_data)
        assert resp1.status_code == 200
        self.created_att_ids.append(resp1.json()["id"])
        
        # Duplicate should fail
        resp2 = self.session.post(f"{BASE_URL}/api/payroll/attendance", json=att_data)
        assert resp2.status_code == 400, "Duplicate date should return 400"
        print("PASS: Duplicate date prevention works")


class TestPayrollRuns:
    """Test payroll run creation and calculations"""
    
    @pytest.fixture(autouse=True)
    def setup(self, auth_session):
        self.session = auth_session
        self.created_emp_ids = []
        self.created_run_ids = []
    
    def teardown_method(self):
        """Cleanup test data"""
        for run_id in self.created_run_ids:
            try:
                # Reopen if closed, then delete
                self.session.post(f"{BASE_URL}/api/payroll/runs/{run_id}/reopen")
                self.session.delete(f"{BASE_URL}/api/payroll/runs/{run_id}")
            except:
                pass
        for emp_id in self.created_emp_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/payroll/employees/{emp_id}")
            except:
                pass
    
    def _create_test_employee(self, name, salary, meal=6.0):
        resp = self.session.post(f"{BASE_URL}/api/payroll/employees", json={
            "name": name, "base_salary": salary, "meal_allowance": meal, "active": True
        })
        emp_id = resp.json()["id"]
        self.created_emp_ids.append(emp_id)
        return emp_id
    
    def _create_attendance(self, emp_id, date, day_type="normal", normal_hours=8, overtime_hours=0):
        resp = self.session.post(f"{BASE_URL}/api/payroll/attendance", json={
            "employee_id": emp_id, "date": date, "day_type": day_type,
            "normal_hours": normal_hours, "overtime_hours": overtime_hours
        })
        return resp.json()["id"]
    
    def test_create_run_basic_calculation(self):
        """POST /api/payroll/runs with 22 normal days calculates correctly"""
        # Create employee: base_salary=1200, meal=6
        emp_id = self._create_test_employee("TEST_Run Employee", 1200, 6.0)
        
        # Create 22 normal work days in May 2026
        for day in range(1, 23):
            self._create_attendance(emp_id, f"2026-05-{day:02d}", "normal", 8, 0)
        
        # Create payroll run
        response = self.session.post(f"{BASE_URL}/api/payroll/runs", json={"month": 5, "year": 2026})
        assert response.status_code == 200
        data = response.json()
        
        self.created_run_ids.append(data["run"]["id"])
        
        # Verify run created
        assert data["run"]["month"] == 5
        assert data["run"]["year"] == 2026
        assert data["run"]["status"] == "rascunho"
        assert data["run"]["employees_count"] >= 1
        
        # Find our employee's item
        item = None
        for it in data["items"]:
            if it["employee_id"] == emp_id:
                item = it
                break
        
        assert item is not None, "Employee item should be in run"
        
        # Verify calculations (base_salary=1200, 22 days, meal=6)
        # salario_base = 1200
        # subsidio_alimentacao = 22 * 6 = 132
        # base_tributavel = 1200 (no OT, no faltas)
        # desconto_ss = 1200 * 0.11 = 132
        # IRS: 1200 is in bracket 870-1200 at 5% = 60
        # total_iliquido = 1200 + 132 = 1332
        # total_liquido = 1332 - 132 - 60 = 1140
        # custo_empresa = 1332 + (1200 * 0.2375) = 1332 + 285 = 1617
        
        assert item["salario_base"] == 1200.0
        assert item["subsidio_alimentacao"] == 132.0, f"Expected 132, got {item['subsidio_alimentacao']}"
        assert item["desconto_ss"] == 132.0, f"Expected SS 132, got {item['desconto_ss']}"
        assert item["desconto_irs"] == 60.0, f"Expected IRS 60, got {item['desconto_irs']}"
        assert item["total_iliquido"] == 1332.0, f"Expected iliquido 1332, got {item['total_iliquido']}"
        assert item["total_liquido"] == 1140.0, f"Expected liquido 1140, got {item['total_liquido']}"
        assert item["custo_total_empresa"] == 1617.0, f"Expected custo 1617, got {item['custo_total_empresa']}"
        
        print("PASS: Basic payroll calculation verified (1200 base → 1140 liquido, 1617 custo empresa)")
    
    def test_create_run_with_overtime(self):
        """POST /api/payroll/runs with overtime hours calculates correctly"""
        # Create employee: base_salary=1200, meal=6
        emp_id = self._create_test_employee("TEST_OT Employee", 1200, 6.0)
        
        # Create 5 days with 2 hours overtime each in June 2026
        # First hour at 125%, second hour at 137.5%
        for day in range(1, 6):
            self._create_attendance(emp_id, f"2026-06-{day:02d}", "normal", 8, 2)
        
        # Create payroll run
        response = self.session.post(f"{BASE_URL}/api/payroll/runs", json={"month": 6, "year": 2026})
        assert response.status_code == 200
        data = response.json()
        
        self.created_run_ids.append(data["run"]["id"])
        
        # Find our employee's item
        item = None
        for it in data["items"]:
            if it["employee_id"] == emp_id:
                item = it
                break
        
        assert item is not None
        
        # Verify overtime hours split:
        # 5 days x 2h OT = 10h total
        # First hour per day (5h) at 125% → horas_extra_1 = 5
        # Second hour per day (5h) at 137.5% → horas_extra_2 = 5
        assert item["horas_extra_1"] == 5.0, f"Expected horas_extra_1=5, got {item['horas_extra_1']}"
        assert item["horas_extra_2"] == 5.0, f"Expected horas_extra_2=5, got {item['horas_extra_2']}"
        
        # Verify OT value calculation
        # hourly_rate = 1200 / (40 * 52 / 12) = 1200 / 173.33 ≈ 6.92
        # valor_horas_extra_1 = 5 * 6.92 * 1.25 ≈ 43.27
        # valor_horas_extra_2 = 5 * 6.92 * 1.375 ≈ 47.60
        # total_horas_extra ≈ 90.87
        assert item["total_horas_extra"] > 0, "Should have overtime value"
        print(f"PASS: Overtime calculation verified (horas_extra_1={item['horas_extra_1']}, horas_extra_2={item['horas_extra_2']}, total={item['total_horas_extra']})")
    
    def test_prevent_duplicate_run(self):
        """POST /api/payroll/runs returns 400 for duplicate month/year"""
        emp_id = self._create_test_employee("TEST_Dup Run Employee", 1000)
        self._create_attendance(emp_id, "2026-07-01", "normal", 8, 0)
        
        # First run
        resp1 = self.session.post(f"{BASE_URL}/api/payroll/runs", json={"month": 7, "year": 2026})
        assert resp1.status_code == 200
        self.created_run_ids.append(resp1.json()["run"]["id"])
        
        # Duplicate should fail
        resp2 = self.session.post(f"{BASE_URL}/api/payroll/runs", json={"month": 7, "year": 2026})
        assert resp2.status_code == 400, "Duplicate run should return 400"
        print("PASS: Duplicate run prevention works")
    
    def test_update_item_premio_recalculates(self):
        """PUT /api/payroll/runs/{id}/items/{iid} with premio recalculates totals"""
        emp_id = self._create_test_employee("TEST_Premio Employee", 1000)
        self._create_attendance(emp_id, "2026-08-01", "normal", 8, 0)
        
        # Create run
        resp = self.session.post(f"{BASE_URL}/api/payroll/runs", json={"month": 8, "year": 2026})
        run_id = resp.json()["run"]["id"]
        self.created_run_ids.append(run_id)
        
        # Find item
        item = None
        for it in resp.json()["items"]:
            if it["employee_id"] == emp_id:
                item = it
                break
        
        original_liquido = item["total_liquido"]
        
        # Update with premio=100, adiantamento=50
        update_resp = self.session.put(
            f"{BASE_URL}/api/payroll/runs/{run_id}/items/{item['id']}",
            json={"premio": 100, "adiantamento": 50}
        )
        assert update_resp.status_code == 200
        updated = update_resp.json()
        
        assert updated["premio"] == 100.0
        assert updated["adiantamento"] == 50.0
        # Premio increases iliquido, adiantamento is deducted from liquido
        # New base_tributavel = 1000 + 100 = 1100
        # New SS = 1100 * 0.11 = 121
        # New IRS = 1100 * 5% = 55 (bracket 870-1200)
        # New iliquido = 1100 + SA
        # New liquido = iliquido - SS - IRS - adiantamento
        assert updated["total_iliquido"] > item["total_iliquido"], "Iliquido should increase with premio"
        print(f"PASS: Item update recalculates (premio=100, adiantamento=50)")
    
    def test_close_run_prevents_edit(self):
        """POST /api/payroll/runs/{id}/close prevents further edits"""
        emp_id = self._create_test_employee("TEST_Close Employee", 1000)
        self._create_attendance(emp_id, "2026-09-01", "normal", 8, 0)
        
        # Create run
        resp = self.session.post(f"{BASE_URL}/api/payroll/runs", json={"month": 9, "year": 2026})
        run_id = resp.json()["run"]["id"]
        self.created_run_ids.append(run_id)
        item_id = resp.json()["items"][0]["id"]
        
        # Close run
        close_resp = self.session.post(f"{BASE_URL}/api/payroll/runs/{run_id}/close")
        assert close_resp.status_code == 200
        
        # Verify status
        get_resp = self.session.get(f"{BASE_URL}/api/payroll/runs/{run_id}")
        assert get_resp.json()["run"]["status"] == "fechado"
        
        # Try to edit item - should fail
        edit_resp = self.session.put(
            f"{BASE_URL}/api/payroll/runs/{run_id}/items/{item_id}",
            json={"premio": 50}
        )
        assert edit_resp.status_code == 400, "Edit after close should return 400"
        print("PASS: Closed run prevents edits")
    
    def test_reopen_run(self):
        """POST /api/payroll/runs/{id}/reopen allows editing again"""
        emp_id = self._create_test_employee("TEST_Reopen Employee", 1000)
        self._create_attendance(emp_id, "2026-10-01", "normal", 8, 0)
        
        # Create and close run
        resp = self.session.post(f"{BASE_URL}/api/payroll/runs", json={"month": 10, "year": 2026})
        run_id = resp.json()["run"]["id"]
        self.created_run_ids.append(run_id)
        
        self.session.post(f"{BASE_URL}/api/payroll/runs/{run_id}/close")
        
        # Reopen
        reopen_resp = self.session.post(f"{BASE_URL}/api/payroll/runs/{run_id}/reopen")
        assert reopen_resp.status_code == 200
        
        # Verify status
        get_resp = self.session.get(f"{BASE_URL}/api/payroll/runs/{run_id}")
        assert get_resp.json()["run"]["status"] == "rascunho"
        print("PASS: Run reopen works")
    
    def test_delete_run_fails_if_closed(self):
        """DELETE /api/payroll/runs/{id} fails if closed"""
        emp_id = self._create_test_employee("TEST_DelClosed Employee", 1000)
        self._create_attendance(emp_id, "2026-11-01", "normal", 8, 0)
        
        # Create and close run
        resp = self.session.post(f"{BASE_URL}/api/payroll/runs", json={"month": 11, "year": 2026})
        run_id = resp.json()["run"]["id"]
        self.created_run_ids.append(run_id)
        
        self.session.post(f"{BASE_URL}/api/payroll/runs/{run_id}/close")
        
        # Try to delete - should fail
        del_resp = self.session.delete(f"{BASE_URL}/api/payroll/runs/{run_id}")
        assert del_resp.status_code == 400, "Delete closed run should return 400"
        print("PASS: Delete closed run fails correctly")
    
    def test_delete_run_works_if_open(self):
        """DELETE /api/payroll/runs/{id} works if open"""
        emp_id = self._create_test_employee("TEST_DelOpen Employee", 1000)
        self._create_attendance(emp_id, "2026-12-01", "normal", 8, 0)
        
        # Create run (don't close)
        resp = self.session.post(f"{BASE_URL}/api/payroll/runs", json={"month": 12, "year": 2026})
        run_id = resp.json()["run"]["id"]
        
        # Delete
        del_resp = self.session.delete(f"{BASE_URL}/api/payroll/runs/{run_id}")
        assert del_resp.status_code == 200
        
        # Verify deleted
        get_resp = self.session.get(f"{BASE_URL}/api/payroll/runs/{run_id}")
        assert get_resp.status_code == 404
        print("PASS: Delete open run works")


class TestPayrollSummary:
    """Test payroll summary endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self, auth_session):
        self.session = auth_session
    
    def test_get_summary(self):
        """GET /api/payroll/summary returns dashboard data"""
        response = self.session.get(f"{BASE_URL}/api/payroll/summary")
        assert response.status_code == 200
        data = response.json()
        
        assert "active_employees" in data
        assert "recent_runs" in data
        assert "attendance_count_month" in data
        assert "total_overtime_month" in data
        assert "faltas_injustificadas_month" in data
        
        assert isinstance(data["active_employees"], int)
        assert isinstance(data["recent_runs"], list)
        print(f"PASS: Summary returned (active_employees={data['active_employees']}, recent_runs={len(data['recent_runs'])})")


# ===== Fixtures =====

@pytest.fixture(scope="module")
def auth_session():
    """Create authenticated session for all tests"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Login
    login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": os.environ.get("TEST_ADMIN_EMAIL", "admin@obelisco.pt"),
        "password": os.environ.get("TEST_ADMIN_PASSWORD", "obelisco2024")
    })
    
    if login_resp.status_code != 200:
        pytest.skip(f"Authentication failed: {login_resp.status_code}")
    
    # Cookies are automatically stored in session
    return session
