#!/usr/bin/env python3
"""
Backend API Testing for P2 Items - Obelisco Manager
Tests dashboard overview, timeclock endpoints, security headers, and rate limiting
"""

import requests
import time
import json
from datetime import datetime, timedelta

# Configuration
BASE_URL = "https://dynamic-colors-2.preview.emergentagent.com/api"
ADMIN_EMAIL = "admin@obelisco.pt"
ADMIN_PASSWORD = "obelisco2024"

# Colors for output
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
RESET = "\033[0m"

class TestResults:
    def __init__(self):
        self.passed = []
        self.failed = []
        self.warnings = []
    
    def add_pass(self, test_name, message=""):
        self.passed.append((test_name, message))
        print(f"{GREEN}✓{RESET} {test_name}: {message}")
    
    def add_fail(self, test_name, message=""):
        self.failed.append((test_name, message))
        print(f"{RED}✗{RESET} {test_name}: {message}")
    
    def add_warning(self, test_name, message=""):
        self.warnings.append((test_name, message))
        print(f"{YELLOW}⚠{RESET} {test_name}: {message}")
    
    def summary(self):
        print(f"\n{BLUE}{'='*80}{RESET}")
        print(f"{BLUE}TEST SUMMARY{RESET}")
        print(f"{BLUE}{'='*80}{RESET}")
        print(f"{GREEN}Passed: {len(self.passed)}{RESET}")
        print(f"{RED}Failed: {len(self.failed)}{RESET}")
        print(f"{YELLOW}Warnings: {len(self.warnings)}{RESET}")
        
        if self.failed:
            print(f"\n{RED}FAILED TESTS:{RESET}")
            for test_name, message in self.failed:
                print(f"  - {test_name}: {message}")
        
        if self.warnings:
            print(f"\n{YELLOW}WARNINGS:{RESET}")
            for test_name, message in self.warnings:
                print(f"  - {test_name}: {message}")
        
        return len(self.failed) == 0

results = TestResults()

def login():
    """Login and get access token"""
    print(f"\n{BLUE}=== AUTHENTICATION ==={RESET}")
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            token = data.get("access_token")
            if token:
                results.add_pass("Authentication", f"Logged in as {ADMIN_EMAIL}")
                return token
            else:
                results.add_fail("Authentication", "No access_token in response")
                return None
        else:
            results.add_fail("Authentication", f"Status {response.status_code}: {response.text[:200]}")
            return None
    except Exception as e:
        results.add_fail("Authentication", f"Exception: {str(e)}")
        return None

def test_dashboard_overview(token):
    """Test GET /api/dashboard/overview - P2 Item 1"""
    print(f"\n{BLUE}=== TEST 1: Dashboard Overview ==={RESET}")
    
    try:
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/dashboard/overview", headers=headers, timeout=15)
        
        # Check status code
        if response.status_code != 200:
            results.add_fail("Dashboard Overview - Status", f"Expected 200, got {response.status_code}")
            return
        
        results.add_pass("Dashboard Overview - Status", "200 OK")
        
        # Check response is JSON
        try:
            data = response.json()
        except Exception as e:
            results.add_fail("Dashboard Overview - JSON", f"Invalid JSON: {str(e)}")
            return
        
        # Check for monthly_revenue_vs_expenses field
        if "monthly_revenue_vs_expenses" not in data:
            results.add_fail("Dashboard Overview - Field", "Missing 'monthly_revenue_vs_expenses' field")
            return
        
        results.add_pass("Dashboard Overview - Field", "Field 'monthly_revenue_vs_expenses' present")
        
        # Validate structure of monthly_revenue_vs_expenses
        monthly_data = data["monthly_revenue_vs_expenses"]
        if not isinstance(monthly_data, list):
            results.add_fail("Dashboard Overview - Structure", "monthly_revenue_vs_expenses is not an array")
            return
        
        if len(monthly_data) == 0:
            results.add_warning("Dashboard Overview - Data", "monthly_revenue_vs_expenses array is empty")
        else:
            results.add_pass("Dashboard Overview - Structure", f"Array has {len(monthly_data)} months")
            
            # Check first item structure
            first_item = monthly_data[0]
            required_fields = ["key", "label", "month", "year", "revenue", "expenses", "net"]
            missing_fields = [f for f in required_fields if f not in first_item]
            
            if missing_fields:
                results.add_fail("Dashboard Overview - Item Structure", f"Missing fields: {missing_fields}")
            else:
                results.add_pass("Dashboard Overview - Item Structure", "All required fields present")
                
                # Validate data types
                if isinstance(first_item.get("revenue"), (int, float)) and \
                   isinstance(first_item.get("expenses"), (int, float)) and \
                   isinstance(first_item.get("net"), (int, float)):
                    results.add_pass("Dashboard Overview - Data Types", "Numeric fields are valid")
                else:
                    results.add_fail("Dashboard Overview - Data Types", "Numeric fields have invalid types")
        
    except Exception as e:
        results.add_fail("Dashboard Overview - Exception", str(e))

def test_timeclock_team_map(token):
    """Test GET /api/service-orders/timeclock/team-map - P2 Item 2"""
    print(f"\n{BLUE}=== TEST 2: Timeclock Team Map ==={RESET}")
    
    try:
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/service-orders/timeclock/team-map", headers=headers, timeout=15)
        
        # Check status code
        if response.status_code != 200:
            results.add_fail("Team Map - Status", f"Expected 200, got {response.status_code}: {response.text[:200]}")
            return
        
        results.add_pass("Team Map - Status", "200 OK")
        
        # Check response is JSON
        try:
            data = response.json()
        except Exception as e:
            results.add_fail("Team Map - JSON", f"Invalid JSON: {str(e)}")
            return
        
        # Check required fields
        required_fields = ["generated_at", "history_date", "latest_positions", "focused_technician", 
                          "history_entries", "summary", "bounds"]
        missing_fields = [f for f in required_fields if f not in data]
        
        if missing_fields:
            results.add_fail("Team Map - Required Fields", f"Missing: {missing_fields}")
        else:
            results.add_pass("Team Map - Required Fields", "All required fields present")
        
        # Check for BSON _id (should not be present) - look for exact "_id" key
        json_str = json.dumps(data)
        if '"_id"' in json_str or "ObjectId" in json_str:
            results.add_fail("Team Map - Serialization", "Response contains _id or ObjectId (not JSON serializable)")
        else:
            results.add_pass("Team Map - Serialization", "No BSON ObjectId found")
        
        # Validate structure
        if "latest_positions" in data and isinstance(data["latest_positions"], list):
            results.add_pass("Team Map - latest_positions", f"Array with {len(data['latest_positions'])} items")
        else:
            results.add_fail("Team Map - latest_positions", "Not an array")
        
        if "history_entries" in data and isinstance(data["history_entries"], list):
            results.add_pass("Team Map - history_entries", f"Array with {len(data['history_entries'])} items")
        else:
            results.add_fail("Team Map - history_entries", "Not an array")
        
        if "summary" in data and isinstance(data["summary"], dict):
            summary = data["summary"]
            summary_fields = ["technicians_count", "clocked_in_count", "stale_count", "history_points"]
            missing_summary = [f for f in summary_fields if f not in summary]
            if missing_summary:
                results.add_fail("Team Map - summary", f"Missing fields: {missing_summary}")
            else:
                results.add_pass("Team Map - summary", "All summary fields present")
        else:
            results.add_fail("Team Map - summary", "Not a dict")
        
    except Exception as e:
        results.add_fail("Team Map - Exception", str(e))

def test_timeclock_all_regression(token):
    """Test GET /api/service-orders/timeclock/all - P2 Item 3"""
    print(f"\n{BLUE}=== TEST 3: Timeclock All (Regression) ==={RESET}")
    
    try:
        headers = {"Authorization": f"Bearer {token}"}
        
        # Test with date range
        today = datetime.now()
        start_date = (today - timedelta(days=30)).strftime("%Y-%m-%d")
        end_date = today.strftime("%Y-%m-%d")
        
        response = requests.get(
            f"{BASE_URL}/service-orders/timeclock/all",
            headers=headers,
            params={"start_date": start_date, "end_date": end_date},
            timeout=15
        )
        
        if response.status_code != 200:
            results.add_fail("Timeclock All - Status", f"Expected 200, got {response.status_code}")
            return
        
        results.add_pass("Timeclock All - Status", "200 OK with date range")
        
        try:
            data = response.json()
            if "entries" in data and isinstance(data["entries"], list):
                results.add_pass("Timeclock All - Structure", f"Returns {len(data['entries'])} entries")
            else:
                results.add_fail("Timeclock All - Structure", "Missing 'entries' array")
        except Exception as e:
            results.add_fail("Timeclock All - JSON", f"Invalid JSON: {str(e)}")
        
    except Exception as e:
        results.add_fail("Timeclock All - Exception", str(e))

def test_timeclock_export_regression(token):
    """Test GET /api/service-orders/timeclock/export - P2 Item 3"""
    print(f"\n{BLUE}=== TEST 4: Timeclock Export (Regression) ==={RESET}")
    
    try:
        headers = {"Authorization": f"Bearer {token}"}
        
        # Test export endpoint
        today = datetime.now()
        start_date = (today - timedelta(days=7)).strftime("%Y-%m-%d")
        end_date = today.strftime("%Y-%m-%d")
        
        response = requests.get(
            f"{BASE_URL}/service-orders/timeclock/export",
            headers=headers,
            params={"start_date": start_date, "end_date": end_date},
            timeout=15
        )
        
        if response.status_code != 200:
            results.add_fail("Timeclock Export - Status", f"Expected 200, got {response.status_code}")
            return
        
        results.add_pass("Timeclock Export - Status", "200 OK")
        
        # Check if it's CSV
        content_type = response.headers.get("content-type", "")
        if "csv" in content_type.lower() or "text/csv" in content_type.lower():
            results.add_pass("Timeclock Export - Content-Type", f"CSV format: {content_type}")
        else:
            results.add_warning("Timeclock Export - Content-Type", f"Expected CSV, got: {content_type}")
        
        # Check content disposition
        content_disp = response.headers.get("content-disposition", "")
        if "attachment" in content_disp.lower():
            results.add_pass("Timeclock Export - Download", "Attachment header present")
        else:
            results.add_warning("Timeclock Export - Download", "No attachment header")
        
    except Exception as e:
        results.add_fail("Timeclock Export - Exception", str(e))

def test_security_headers(token):
    """Test security headers - P2 Item 4"""
    print(f"\n{BLUE}=== TEST 5: Security Headers ==={RESET}")
    
    try:
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/dashboard/overview", headers=headers, timeout=10)
        
        # Check Content-Security-Policy
        csp = response.headers.get("Content-Security-Policy")
        if csp:
            results.add_pass("Security Headers - CSP", f"Present: {csp[:50]}...")
        else:
            results.add_fail("Security Headers - CSP", "Content-Security-Policy header missing")
        
        # Check X-Content-Type-Options
        xcto = response.headers.get("X-Content-Type-Options")
        if xcto and xcto.lower() == "nosniff":
            results.add_pass("Security Headers - X-Content-Type-Options", "nosniff")
        else:
            results.add_fail("Security Headers - X-Content-Type-Options", f"Expected 'nosniff', got: {xcto}")
        
        # Check Referrer-Policy
        rp = response.headers.get("Referrer-Policy")
        if rp:
            results.add_pass("Security Headers - Referrer-Policy", rp)
        else:
            results.add_fail("Security Headers - Referrer-Policy", "Header missing")
        
        # Check X-Frame-Options (bonus)
        xfo = response.headers.get("X-Frame-Options")
        if xfo:
            results.add_pass("Security Headers - X-Frame-Options", xfo)
        else:
            results.add_warning("Security Headers - X-Frame-Options", "Header missing (optional)")
        
    except Exception as e:
        results.add_fail("Security Headers - Exception", str(e))

def test_rate_limiting():
    """Test rate limiting on public endpoints - P2 Item 4"""
    print(f"\n{BLUE}=== TEST 6: Rate Limiting ==={RESET}")
    
    try:
        # Test /api/service-orders/check-availability (public endpoint with 30 req/60s limit)
        endpoint = f"{BASE_URL}/service-orders/check-availability"
        
        # Make requests until we hit rate limit (max 35 to be safe)
        rate_limited = False
        request_count = 0
        max_requests = 35
        
        print(f"Testing rate limit on {endpoint}...")
        
        for i in range(max_requests):
            try:
                response = requests.get(
                    endpoint,
                    params={"preferred_date": "2025-02-01T10:00:00"},
                    timeout=5
                )
                request_count += 1
                
                if response.status_code == 429:
                    rate_limited = True
                    results.add_pass("Rate Limiting - Public Endpoint", 
                                   f"Rate limit triggered after {request_count} requests (429 Too Many Requests)")
                    
                    # Check Retry-After header
                    retry_after = response.headers.get("Retry-After")
                    if retry_after:
                        results.add_pass("Rate Limiting - Retry-After", f"Header present: {retry_after}s")
                    else:
                        results.add_warning("Rate Limiting - Retry-After", "Header missing")
                    break
                
                # Small delay to avoid overwhelming the server
                time.sleep(0.1)
                
            except Exception as e:
                results.add_warning("Rate Limiting - Request", f"Request {i+1} failed: {str(e)}")
                break
        
        if not rate_limited:
            results.add_warning("Rate Limiting - Public Endpoint", 
                              f"Rate limit not triggered after {request_count} requests (expected ~30)")
        
    except Exception as e:
        results.add_fail("Rate Limiting - Exception", str(e))

def test_rate_limiting_authenticated(token):
    """Test that rate limiting doesn't affect authenticated endpoints - P2 Item 4"""
    print(f"\n{BLUE}=== TEST 7: Rate Limiting (Authenticated) ==={RESET}")
    
    try:
        headers = {"Authorization": f"Bearer {token}"}
        
        # Make multiple requests to authenticated endpoint
        success_count = 0
        for i in range(10):
            response = requests.get(f"{BASE_URL}/dashboard/overview", headers=headers, timeout=10)
            if response.status_code == 200:
                success_count += 1
            elif response.status_code == 429:
                results.add_fail("Rate Limiting - Authenticated", 
                               f"Authenticated endpoint rate limited after {i+1} requests")
                return
            time.sleep(0.1)
        
        if success_count == 10:
            results.add_pass("Rate Limiting - Authenticated", 
                           "Authenticated endpoints not affected by rate limiting (10 requests OK)")
        else:
            results.add_warning("Rate Limiting - Authenticated", 
                              f"Only {success_count}/10 requests succeeded")
        
    except Exception as e:
        results.add_fail("Rate Limiting - Authenticated - Exception", str(e))

def test_cors():
    """Test CORS headers - P2 Item 5"""
    print(f"\n{BLUE}=== TEST 8: CORS ==={RESET}")
    
    try:
        # Test OPTIONS request (preflight)
        response = requests.options(
            f"{BASE_URL}/dashboard/overview",
            headers={
                "Origin": "https://dynamic-colors-2.preview.emergentagent.com",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "Authorization"
            },
            timeout=10
        )
        
        # Check CORS headers
        acao = response.headers.get("Access-Control-Allow-Origin")
        if acao:
            results.add_pass("CORS - Allow-Origin", f"Present: {acao}")
        else:
            results.add_fail("CORS - Allow-Origin", "Header missing")
        
        acam = response.headers.get("Access-Control-Allow-Methods")
        if acam:
            results.add_pass("CORS - Allow-Methods", f"Present: {acam}")
        else:
            results.add_warning("CORS - Allow-Methods", "Header missing")
        
        acac = response.headers.get("Access-Control-Allow-Credentials")
        if acac and acac.lower() == "true":
            results.add_pass("CORS - Allow-Credentials", "true")
        else:
            results.add_warning("CORS - Allow-Credentials", f"Expected 'true', got: {acac}")
        
    except Exception as e:
        results.add_fail("CORS - Exception", str(e))

def main():
    print(f"{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}OBELISCO MANAGER - BACKEND P2 TESTING{RESET}")
    print(f"{BLUE}{'='*80}{RESET}")
    print(f"Base URL: {BASE_URL}")
    print(f"Testing as: {ADMIN_EMAIL}")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Login
    token = login()
    if not token:
        print(f"\n{RED}Authentication failed. Cannot proceed with tests.{RESET}")
        return False
    
    # Run all tests
    test_dashboard_overview(token)
    test_timeclock_team_map(token)
    test_timeclock_all_regression(token)
    test_timeclock_export_regression(token)
    test_security_headers(token)
    test_rate_limiting()
    test_rate_limiting_authenticated(token)
    test_cors()
    
    # Summary
    success = results.summary()
    
    if success:
        print(f"\n{GREEN}{'='*80}{RESET}")
        print(f"{GREEN}ALL TESTS PASSED!{RESET}")
        print(f"{GREEN}{'='*80}{RESET}")
    else:
        print(f"\n{RED}{'='*80}{RESET}")
        print(f"{RED}SOME TESTS FAILED - SEE DETAILS ABOVE{RESET}")
        print(f"{RED}{'='*80}{RESET}")
    
    return success

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
