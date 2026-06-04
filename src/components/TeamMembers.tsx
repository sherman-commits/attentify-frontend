import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useCompany } from "../context/CompanyContext";
import { useNotification } from "../context/NotificationContext";
import { useUser } from "../context/UserContext";
import RoleWrapper from "./RoleWrapper";
import axios from "axios";
import ConfirmDialog from "./ConfirmDialog";

type Role = "company_owner" | "store_owner" | "agent" | "readonly";
type CustomPermission =
  | "permanent_delete_ticket"
  | "resolve_ticket_without_owner_approval"
  | "process_refund_without_owner_approval"
  | "process_cancellation_without_owner_approval";

interface Member {
  id: string;
  email: string;
  role: Role;
  status: "active" | "pending";
  custom_permissions?: CustomPermission[];
}

const customPermissions: { key: CustomPermission; label: string }[] = [
  { key: "permanent_delete_ticket", label: "Permanently delete ticket" },
  { key: "resolve_ticket_without_owner_approval", label: "Resolve without owner approval" },
  { key: "process_refund_without_owner_approval", label: "Refund without owner approval" },
  { key: "process_cancellation_without_owner_approval", label: "Cancel without owner approval" },
];

const sortedPermissions = (permissions: string[] = []) => [...permissions].sort().join("|");

export default function TeamMembers() {
  const { currentCompanyId } = useCompany();
  const { notify } = useNotification();
  const { user } = useUser();
  const navigate = useNavigate();

  const [members, setMembers] = useState<Member[]>([]);
  const [originalMembers, setOriginalMembers] = useState<Member[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const canManageMembers = user?.role === "admin" || user?.role === "company_owner";
  const activeOwnerCount = members.filter(
    (member) => member.status === "active" && member.role === "company_owner"
  ).length;

  const isCurrentUserMember = (member: Member) =>
    member.status === "active" && member.email === user?.email;

  const isProtectedOwner = (member: Member) =>
    member.status === "active" &&
    member.role === "company_owner" &&
    (isCurrentUserMember(member) || activeOwnerCount <= 1);

  const fetchMembers = async () => {
    try {
      const response = await axios.get(
        `${import.meta.env.VITE_API_URL || ""}/company/${currentCompanyId}/members`,
        {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        }
      );
      const data = response.data;
      if (data) {
        setMembers(data || []);
        setOriginalMembers(data || []);
      }
    } catch (error) {
      console.error("Error fetching members:", error);
      notify("error", "Error fetching members");
    }
  };

  useEffect(() => {
    if (!currentCompanyId) return;

    fetchMembers();
  }, [currentCompanyId]);

  const handleRoleChange = (index: number, newRole: Role) => {
    const member = members[index];
    if (member && isProtectedOwner(member) && newRole !== "company_owner") {
      notify(
        "error",
        isCurrentUserMember(member)
          ? "You cannot remove your own owner role."
          : "At least one company owner must remain."
      );
      return;
    }

    const updated = members.map((m, i) =>
      i === index ? { ...m, role: newRole } : m
    );
    setMembers(updated);

    // Detect if changes exist
    setHasChanges(hasMemberChanges(updated));
  };

  const hasMemberChanges = (updatedMembers: Member[]) =>
    updatedMembers.some((member, index) => {
      const original = originalMembers[index];
      return (
        member.role !== original?.role ||
        sortedPermissions(member.custom_permissions) !== sortedPermissions(original?.custom_permissions)
      );
    });

  const handlePermissionChange = (index: number, permission: CustomPermission) => {
    const updated = members.map((member, memberIndex) => {
      if (memberIndex !== index) return member;

      const permissions = member.custom_permissions || [];
      return {
        ...member,
        custom_permissions: permissions.includes(permission)
          ? permissions.filter((item) => item !== permission)
          : [...permissions, permission],
      };
    });

    setMembers(updated);
    setHasChanges(hasMemberChanges(updated));
  };

  const handleSaveChanges = async () => {
    try {
      const changedMembers = members.filter(
        (member, index) => {
          const original = originalMembers[index];
          return (
            member.role !== original?.role ||
            sortedPermissions(member.custom_permissions) !== sortedPermissions(original?.custom_permissions)
          );
        }
      );
      
      
      // Update only changed members
      await Promise.all(
        changedMembers.map((member) =>
          axios.post(
            `${import.meta.env.VITE_API_URL}/company/update-member`,
            {
              id: member.id,
              role: member.role,
              status: member.status,
              custom_permissions: member.custom_permissions || [],
            },
            {
              headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`,
              },
            }
          )
        )
      );

      setOriginalMembers(members);
      setHasChanges(false);
      notify("success", "Changes saved successfully");
    } catch (error) {
      console.error("Failed to save changes:", error);
      notify("error", "Failed to save changes");
    }
  };

  const handleCancelChanges = () => {
    setMembers(originalMembers);
    setHasChanges(false);
  };

  const handleAddMember = () => {
    navigate("/invite");
  };

  const onDelete = (id: string) => {
    const member = members.find((m) => m.id === id) || null;
    if (member && isCurrentUserMember(member)) {
      notify("error", "You cannot delete your own account.");
      return;
    }
    if (member && member.role === "company_owner" && activeOwnerCount <= 1) {
      notify("error", "At least one company owner must remain.");
      return;
    }

    setSelectedMember(member);
    setIsOpen(true);
  };

  const handleDeleteMember = async (id: string) => {
    try {
      await axios.delete(
        `${import.meta.env.VITE_API_URL}/company/delete-member`, // make sure your backend route supports this
        {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
          data: { 
            id,
            status: members.find((m) => m.id === id)?.status || "active" 
          }, 
        }
      );

      notify("success", "Member removed from team");
      fetchMembers();
    } catch (error) {
      console.error("Failed to remove member:", error);
      notify("error", "Failed to remove member");
    }
  };


  const renderStatusTag = (status: "active" | "pending") => {
    if (status === "pending") {
      return (
        <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded-full">
          Pending
        </span>
      );
    } else if (status === "active") {
      return (
        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
          Active
        </span>
      );
    }
  };

  return (
    <section>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-xl font-semibold text-gray-800">Team Members</h3>
          <p className="text-sm text-gray-500">
            Add team members to collaborate in your workspace. Optionally
            specify member roles to enhance security.
          </p>
        </div>
        <RoleWrapper allowedRoles={["admin", "company_owner"]} userRole={user?.role || "agent"}>
          <button
            onClick={handleAddMember}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            Add Member
          </button>
        </RoleWrapper>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border border-gray-300 overflow-hidden">
          <thead>
            <tr className="bg-gray-100 text-left">
              <th className="px-4 py-2 border-b border-gray-300">Member Email</th>
              <th className="px-4 py-2 border-b border-gray-300">Role</th>
              <th className="px-4 py-2 border-b border-gray-300">Custom Permissions</th>
              <th className="px-4 py-2 border-b border-gray-300">Status</th>
              <RoleWrapper allowedRoles={["admin", "company_owner"]} userRole={user?.role || "agent"}>
                <th className="px-4 py-2 border-b border-gray-300">Actions</th>
              </RoleWrapper>
            </tr>
          </thead>
          <tbody>
            {members.map((member, index) => (
              <tr key={member.id} className="border-b border-gray-200">
                <td className="px-4 py-2">{member.email}</td>
                <td className="px-4 py-2">
                  { canManageMembers?
                    ( 
                      <select
                        value={member.role}
                        onChange={(e) =>
                          handleRoleChange(index, e.target.value as Role)
                        }
                        disabled={isProtectedOwner(member)}
                        className="border border-gray-300 px-2 py-1"
                        title={
                          isProtectedOwner(member)
                            ? isCurrentUserMember(member)
                              ? "You cannot remove your own owner role"
                              : "At least one company owner must remain"
                            : undefined
                        }
                      >
                        <option value="company_owner">Owner</option>
                        <option value="store_owner">Store Owner</option>
                        <option value="agent">Agent</option>
                        <option value="readonly">Read-only</option>
                      </select>
                    )
                    : 
                    (
                      member.role
                    )
                  }
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-col gap-2">
                    {customPermissions.map((permission) => (
                      <label key={permission.key} className="inline-flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={(member.custom_permissions || []).includes(permission.key)}
                          onChange={() => handlePermissionChange(index, permission.key)}
                          disabled={!canManageMembers}
                          className="h-4 w-4 text-blue-600 border-gray-300"
                        />
                        {permission.label}
                      </label>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2">{renderStatusTag(member.status)}</td>
                <RoleWrapper allowedRoles={["admin", "company_owner"]} userRole={user?.role || "agent"}>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => onDelete(member.id)}
                      disabled={isCurrentUserMember(member) || (member.role === "company_owner" && activeOwnerCount <= 1)}
                      className="px-3 py-1 bg-red-500 text-white text-sm hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                      title={
                        isCurrentUserMember(member)
                          ? "You cannot delete your own account"
                          : member.role === "company_owner" && activeOwnerCount <= 1
                            ? "At least one company owner must remain"
                            : undefined
                      }
                    >
                      Remove
                    </button>
                  </td>
                </RoleWrapper>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasChanges && (
        <RoleWrapper allowedRoles={["admin", "company_owner"]} userRole={user?.role || "agent"}>
          <div className="flex justify-end gap-3 mt-4">
            <button
              onClick={handleSaveChanges}
              className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700"
            >
              Save Changes
            </button>

            <button
              onClick={handleCancelChanges}
              className="px-4 py-2 bg-gray-300 text-gray-800 hover:bg-gray-400"
            >
              Cancel
            </button>
          </div>
        </RoleWrapper>
      )}

      <ConfirmDialog
        isOpen={isOpen}
        title="Delete Member"
        message="Are you sure you want to remove this member from the team? Their account and history will be kept."
        confirmText="Remove"
        onConfirm={() => {
          if (selectedMember) {
            handleDeleteMember(selectedMember.id);
          }
          setIsOpen(false);
        }}
        onCancel={() => setIsOpen(false)}
      />
    </section>
  );
}
