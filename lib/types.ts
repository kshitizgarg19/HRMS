export type Role = "EMPLOYEE" | "HR" | "ADMIN";

export interface SessionUser {
  id: number;
  name: string;
  role: Role;
  emp_code: string;
  email: string;
  /** True when this user is HOD of at least one department (grants dept-level approval access). */
  is_hod?: boolean;
}

export interface Department {
  id: number;
  name: string;
  hod_id: number | null;
  hod_name?: string | null;
  headcount?: number;
}

export interface Employee {
  id: number;
  emp_code: string;
  name: string;
  email: string;
  role: Role;
  designation: string | null;
  department: string | null;
  manager_id: number | null;
  manager_name?: string | null;
  join_date: string | null;
  dob: string | null;
  gender: string | null;
  blood_group: string | null;
  marital_status: string | null;
  phone: string | null;
  alt_phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  emergency_name: string | null;
  emergency_phone: string | null;
  emergency_relation: string | null;
  work_location: string | null;
  employment_type: string | null;
  status: "Active" | "On Notice" | "Exited";
  bank_name: string | null;
  account_no: string | null;
  ifsc: string | null;
  pan: string | null;
  uan: string | null;
  basic: number;
  hra: number;
  special_allowance: number;
  conveyance: number;
  avatar_color: string | null;
}

export interface AttendanceRecord {
  id: number;
  employee_id: number;
  employee_name?: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  hours: number | null;
  status: "Present" | "Absent" | "Leave" | "Half Day" | "Holiday" | "On Duty";
  mode: "WFO" | "WFH" | null;
}

export interface DutyRequest {
  id: number;
  employee_id: number;
  employee_name?: string;
  emp_code?: string;
  department?: string | null;
  avatar_color?: string | null;
  from_date: string;
  to_date: string;
  days: number;
  slot: "full" | "first" | "second";
  location: string;
  purpose: string;
  status: "Pending" | "Approved" | "Rejected" | "Cancelled";
  reviewed_by: number | null;
  reviewer_name?: string | null;
  review_note: string | null;
  created_at: string;
}

export interface Timesheet {
  id: number;
  employee_id: number;
  employee_name?: string;
  emp_code?: string;
  date: string;
  location: string;
  tasks: string;
  hours: number;
  status: "Pending" | "Approved" | "Rejected";
  reviewed_by: number | null;
  reviewer_name?: string | null;
  review_note?: string | null;
}

export interface LeaveType {
  id: number;
  name: string;
  annual_quota: number;
  paid: number;
  carry_forward?: number;
  carry_cap?: number;
  encashable?: number;
  scope?: string | null;
}

export interface LeaveBalance {
  leave_type_id: number;
  leave_type: string;
  paid: number;
  allocated: number;
  used: number;
  balance: number;
}

export interface LeaveRequest {
  id: number;
  employee_id: number;
  employee_name?: string;
  emp_code?: string;
  department?: string | null;
  leave_type_id: number;
  leave_type?: string;
  from_date: string;
  to_date: string;
  days: number;
  half: "none" | "first" | "second";
  reason: string;
  responsible_id: number | null;
  responsible_name?: string | null;
  status: "Pending" | "Approved" | "Rejected" | "Cancelled";
  reviewed_by: number | null;
  reviewer_name?: string | null;
  review_note: string | null;
  created_at: string;
}

export interface Reimbursement {
  id: number;
  employee_id: number;
  employee_name?: string;
  emp_code?: string;
  category: string;
  amount: number;
  expense_date: string;
  description: string;
  receipt: string | null;
  receipt_type?: string | null;
  has_receipt?: number;
  status: "Pending" | "Approved" | "Rejected";
  reviewed_by: number | null;
  reviewer_name?: string | null;
  review_note: string | null;
  created_at: string;
}

export interface Task {
  id: number;
  title: string;
  category: string;
  description: string | null;
  assigned_to: number;
  assignee_name?: string;
  assigned_by: number;
  assigner_name?: string;
  priority: "Low" | "Medium" | "High" | "Urgent";
  duration: string | null;
  due_date: string | null;
  status: "To Do" | "In Progress" | "Done";
  created_at: string;
}

export interface Payslip {
  id: number;
  employee_id: number;
  employee_name?: string;
  emp_code?: string;
  department?: string | null;
  designation?: string | null;
  pan?: string | null;
  bank_name?: string | null;
  account_no?: string | null;
  uan?: string | null;
  join_date?: string | null;
  month: number;
  year: number;
  basic: number;
  hra: number;
  special_allowance: number;
  conveyance: number;
  gross: number;
  pf: number;
  prof_tax: number;
  tds: number;
  lop_days: number;
  lop_amount: number;
  total_deductions: number;
  net: number;
  paid_days: number;
  status: "Generated" | "Paid";
  generated_at: string;
  components?: string | null;
}

export interface SalaryComponent {
  id: number;
  name: string;
  type: "earning" | "deduction";
  amount: number;
  active: number;
}

export interface Holiday {
  id: number;
  name: string;
  date: string;
  type: "Public" | "Optional";
  description: string | null;
}

export interface Announcement {
  id: number;
  title: string;
  body: string;
  pinned: number;
  created_by: number;
  author_name?: string;
  created_at: string;
}

/* ---------------- Books / Finance ---------------- */
export interface BooksParty {
  id: number;
  type: "customer" | "vendor";
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  gstin: string | null;
  billing_address: string | null;
  notes: string | null;
  created_at: string;
  receivable?: number; // outstanding (computed)
}

export interface BooksItem {
  id: number;
  name: string;
  sku: string | null;
  type: "goods" | "service";
  rate: number;
  purchase_rate: number;
  tax_rate: number;
  stock: number;
  low_stock: number;
  unit: string | null;
  hsn: string | null;
  active: number;
}

export interface BooksTxnLine {
  id?: number;
  item_id: number | null;
  name: string;
  qty: number;
  rate: number;
  tax_rate: number;
  amount: number;
}

export interface BooksTxn {
  id: number;
  type: "quote" | "invoice" | "bill";
  number: string;
  party_id: number | null;
  party_name?: string | null;
  party_company?: string | null;
  txn_date: string;
  due_date: string | null;
  status: string;
  subtotal: number;
  tax: number;
  total: number;
  paid: number;
  notes: string | null;
  converted_to: number | null;
  created_at: string;
  lines?: BooksTxnLine[];
  payments?: { id: number; amount: number; pay_date: string; mode: string | null; reference: string | null }[];
}
