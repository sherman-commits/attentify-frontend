import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

export async function login(email: string, password: string) {
  try {
    const response = await axios.post(
      `${API_URL}/auth/login`,
      new URLSearchParams({ username: email, password }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        withCredentials: true,
      }
    );
    return response.data;
  } catch (error: any) {
    throw new Error(error?.response?.data?.detail || "Login failed");
  }
}

export async function register(email: string, password: string, firstName: string, lastName: string, invitation_token: string | null = null) {
  try {
    const response = await axios.post(
      `${API_URL}/auth/register`,
      { 
        email, 
        password,
        first_name: firstName,
        last_name: lastName,
        invitation_token
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        withCredentials: true,
      }
    );
    return response.data;
  } catch (error: any) {
    throw new Error(error?.response?.data?.detail || "Register failed");
  }
}

export async function registerWithToken(email: string, password: string, firstName: string, lastName: string) {
  try {
    const response = await axios.post(
      `${API_URL}/auth/register`,
      { 
        email, 
        password,
        first_name: firstName,
        last_name: lastName,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        withCredentials: true,
      }
    );
    return response.data;
  } catch (error: any) {
    throw new Error(error?.response?.data?.detail || "Register failed");
  }
}
